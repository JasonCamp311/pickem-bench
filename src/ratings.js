// Track 2's math: two team ratings built from final scores only, blended into
// a predicted score and a win probability. No betting line goes in anywhere.
//
// The parameters were fitted on the 2021-2024 seasons, checked on 2025, and
// frozen before week 6 of 2026 (tools/backtest.js reruns that test). Changing
// one changes what track 2 is, so a change needs new contestant ids.

export const PARAMS = {
  // Elo: K, how much of a rating survives the offseason, home edge in points,
  // and how many Elo points equal one point on the scoreboard.
  elo: { k: 20, carry: 0.6, home: 1.5, perPoint: 25 },
  // Ridge: shrinkage strength (in games), how much of last season's rating is
  // the starting point, home edge in points, and solver sweeps.
  ridge: { lambda: 9, carry: 0.45, home: 1.5, sweeps: 12 },
  // Standard deviation of (actual margin - predicted margin), in points.
  sigma: 11,
  // Points per team per game when there is no earlier season to average.
  basePoints: 22.5,
};

const byKickoff = (a, b) => a.kickoff.localeCompare(b.kickoff);

// Standard normal CDF, by the Abramowitz-Stegun approximation of erf (error < 1.5e-7).
export function normalCdf(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/* ---------- Elo with margin of victory ---------- */

// seasons: [{ season, games }] oldest first; games are finals with scores.
// Returns the rating of every team after the last game given.
export function eloRatings(seasons, p = PARAMS.elo) {
  const r = {};
  for (const { games } of seasons) {
    for (const t of Object.keys(r)) r[t] = 1500 + p.carry * (r[t] - 1500);
    for (const g of [...games].sort(byKickoff)) {
      const home = (r[g.home] ??= 1500);
      const away = (r[g.away] ??= 1500);
      const diff = home - away + (g.neutral ? 0 : p.home * p.perPoint);
      const expected = 1 / (1 + 10 ** (-diff / 400));
      const margin = g.homeScore - g.awayScore;
      const result = margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
      // Bigger wins move ratings more, but less so when the favorite does the winning.
      const mult = (Math.log(Math.abs(margin) + 1) * 2.2) / ((margin > 0 ? diff : -diff) * 0.001 + 2.2);
      const step = p.k * mult * (result - expected);
      r[g.home] = home + step;
      r[g.away] = away - step;
    }
  }
  return r;
}

/* ---------- Ridge-regressed offense and defense ---------- */

// Model: home points = mu + h/2 + off[home] - def[away]
//        away points = mu - h/2 + off[away] - def[home]
// minimising squared error plus lambda * (rating - prior)^2 for every rating,
// solved by alternating exact updates of the offenses and the defenses.
function ridgeFit(games, prior, mu, p) {
  const teams = new Set([...Object.keys(prior.off), ...games.flatMap((g) => [g.home, g.away])]);
  const start = (side) => Object.fromEntries([...teams].map((t) => [t, side[t] ?? 0]));
  const priorOff = start(prior.off);
  const priorDef = start(prior.def);
  let off = { ...priorOff };
  let def = { ...priorDef };
  const rows = games.map((g) => ({ ...g, edge: g.neutral ? 0 : p.home / 2 }));
  for (let sweep = 0; sweep < p.sweeps; sweep++) {
    const num = {};
    const den = {};
    for (const t of teams) { num[t] = p.lambda * priorOff[t]; den[t] = p.lambda; }
    for (const g of rows) {
      num[g.home] += g.homeScore - mu - g.edge + def[g.away]; den[g.home]++;
      num[g.away] += g.awayScore - mu + g.edge + def[g.home]; den[g.away]++;
    }
    off = Object.fromEntries([...teams].map((t) => [t, num[t] / den[t]]));
    for (const t of teams) { num[t] = p.lambda * priorDef[t]; den[t] = p.lambda; }
    for (const g of rows) {
      num[g.away] += mu + g.edge + off[g.home] - g.homeScore; den[g.away]++;
      num[g.home] += mu - g.edge + off[g.away] - g.awayScore; den[g.home]++;
    }
    def = Object.fromEntries([...teams].map((t) => [t, num[t] / den[t]]));
  }
  return { off, def };
}

const meanPoints = (games, fallback) =>
  games.length ? games.reduce((sum, g) => sum + g.homeScore + g.awayScore, 0) / (2 * games.length) : fallback;

// Each season's ratings start from a fraction of where the last season ended,
// so the chain runs from the oldest season given to the newest.
export function ridgeRatings(seasons, p = PARAMS.ridge, base = PARAMS.basePoints) {
  let fit = { off: {}, def: {} };
  let mu = base;
  seasons.forEach(({ games }, i) => {
    const scale = (side) => Object.fromEntries(Object.entries(side).map(([t, v]) => [t, p.carry * v]));
    mu = i ? meanPoints(seasons[i - 1].games, base) : base;
    fit = ridgeFit(games, { off: scale(fit.off), def: scale(fit.def) }, mu, p);
  });
  return { ...fit, mu };
}

/* ---------- The blend ---------- */

// seasons: every completed earlier season plus the current one up to now.
// Returns per-team ratings and a predict() for any matchup.
export function buildRatings(seasons, params = PARAMS) {
  const elo = eloRatings(seasons, params.elo);
  const ridge = ridgeRatings(seasons, params.ridge, params.basePoints);
  const teams = {};
  for (const t of new Set([...Object.keys(elo), ...Object.keys(ridge.off)])) {
    const off = ridge.off[t] ?? 0;
    const def = ridge.def[t] ?? 0;
    const eloPts = ((elo[t] ?? 1500) - 1500) / params.elo.perPoint;
    // One number per team: points better than an average team on a neutral field.
    teams[t] = { elo: elo[t] ?? 1500, off, def, power: (off + def + eloPts) / 2 };
  }
  const get = (t) => teams[t] ?? { elo: 1500, off: 0, def: 0, power: 0 };

  function predict(home, away, neutral = false) {
    const h = get(home);
    const a = get(away);
    const edge = neutral ? 0 : params.ridge.home / 2;
    const ridgeHome = ridge.mu + edge + h.off - a.def;
    const ridgeAway = ridge.mu - edge + a.off - h.def;
    const eloMargin = (h.elo - a.elo) / params.elo.perPoint + (neutral ? 0 : params.elo.home);
    const margin = (ridgeHome - ridgeAway + eloMargin) / 2;
    const total = ridgeHome + ridgeAway;
    return {
      margin,
      total,
      homePoints: (total + margin) / 2,
      awayPoints: (total - margin) / 2,
      homeWin: normalCdf(margin / params.sigma),
    };
  }
  return { teams, predict, mu: ridge.mu };
}

// Whole-number final score for the code-only contestant. The margin is rounded
// first so the pick sits on the same side of any spread as the raw number, and
// a margin that rounds to zero goes to whichever side the raw number leans.
export function scoreline(pred) {
  let margin = Math.round(pred.margin);
  if (margin === 0) margin = pred.margin >= 0 ? 1 : -1;
  let total = Math.round(pred.total);
  if ((total - margin) % 2 !== 0) total += 1;
  return { home: (total + margin) / 2, away: (total - margin) / 2 };
}
