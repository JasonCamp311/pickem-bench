// Football-only team dossiers, derived purely from this season's final scores.

const DAY = 86400000;

function blank(abbr) {
  return { abbr, w: 0, l: 0, t: 0, hw: 0, hl: 0, rw: 0, rl: 0, pf: 0, pa: 0, gp: 0, results: [], lastPlayed: null };
}

// priorWeeks: [{ week, games }] of normalized games; only finals count.
export function buildDossiers(priorWeeks, slateGames) {
  const teams = {};
  const get = (abbr) => (teams[abbr] ??= blank(abbr));

  for (const { week, games } of [...priorWeeks].sort((a, b) => a.week - b.week)) {
    for (const g of games) {
      if (g.status !== 'final') continue;
      for (const isHome of [false, true]) {
        const t = get(isHome ? g.home : g.away);
        const mine = isHome ? g.homeScore : g.awayScore;
        const theirs = isHome ? g.awayScore : g.homeScore;
        const res = mine > theirs ? 'W' : mine < theirs ? 'L' : 'T';
        t.gp++;
        t.pf += mine;
        t.pa += theirs;
        if (res === 'W') { t.w++; if (!g.neutral) isHome ? t.hw++ : t.rw++; }
        if (res === 'L') { t.l++; if (!g.neutral) isHome ? t.hl++ : t.rl++; }
        if (res === 'T') t.t++;
        const where = g.neutral ? 'vs' : isHome ? 'vs' : '@';
        t.results.push({ week, res, text: `W${week} ${res} ${mine}-${theirs} ${where} ${isHome ? g.away : g.home}${g.neutral ? ' (neutral)' : ''}` });
        t.lastPlayed = g.kickoff;
      }
    }
  }

  const out = {};
  for (const g of slateGames) {
    for (const abbr of [g.away, g.home]) {
      const t = get(abbr);
      const per = (n) => (t.gp ? Math.round((n / t.gp) * 10) / 10 : null);
      let streak = null;
      if (t.results.length) {
        const last = t.results[t.results.length - 1].res;
        let n = 0;
        for (let i = t.results.length - 1; i >= 0 && t.results[i].res === last; i--) n++;
        streak = `${last}${n}`;
      }
      out[abbr] = {
        abbr,
        record: `${t.w}-${t.l}${t.t ? `-${t.t}` : ''}`,
        homeRecord: `${t.hw}-${t.hl}`,
        roadRecord: `${t.rw}-${t.rl}`,
        pointsFor: per(t.pf),
        pointsAgainst: per(t.pa),
        streak,
        restDays: t.lastPlayed ? Math.round((Date.parse(g.kickoff) - Date.parse(t.lastPlayed)) / DAY) : null,
        results: t.results.map((r) => r.text),
      };
    }
  }
  return out;
}

const SEVERITY = ['Out', 'Injured Reserve', 'Doubtful', 'Questionable'];
const MAX_INJURIES = 6;

// Quarterbacks first, then the most certain absences; the report does not say
// who starts, so the list is capped rather than filtered by importance.
function trimInjuries(list) {
  const rank = (i) => (i.pos === 'QB' ? 0 : 10) + (SEVERITY.indexOf(i.status) === -1 ? 9 : SEVERITY.indexOf(i.status));
  return [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, MAX_INJURIES);
}

const round1 = (n) => Math.round(n * 10) / 10;

// Track 2's data sheet: this season's results, last season's totals, the code
// ratings and the injury report. `ratings` comes from buildRatings().
export function buildDossiersV2(priorWeeks, slateGames, lastSeason, ratings, injuries) {
  const base = buildDossiers(priorWeeks, slateGames);
  const prev = {};
  for (const g of (lastSeason && lastSeason.games) || []) {
    for (const [abbr, mine, theirs] of [[g.home, g.homeScore, g.awayScore], [g.away, g.awayScore, g.homeScore]]) {
      const t = (prev[abbr] ??= { w: 0, l: 0, t: 0, pf: 0, pa: 0, gp: 0 });
      t.gp++; t.pf += mine; t.pa += theirs;
      if (mine > theirs) t.w++; else if (mine < theirs) t.l++; else t.t++;
    }
  }
  const order = Object.entries(ratings.teams).sort((a, b) => b[1].power - a[1].power).map(([abbr]) => abbr);
  const out = {};
  for (const [abbr, t] of Object.entries(base)) {
    const p = prev[abbr];
    const r = ratings.teams[abbr] || { power: 0, off: 0, def: 0 };
    out[abbr] = {
      abbr,
      record: t.record,
      pointsFor: t.pointsFor,
      pointsAgainst: t.pointsAgainst,
      results: t.results,
      lastSeason: p ? { record: `${p.w}-${p.l}${p.t ? `-${p.t}` : ''}`, pointsFor: round1(p.pf / p.gp), pointsAgainst: round1(p.pa / p.gp) } : null,
      rating: { power: round1(r.power), offense: round1(r.off), defense: round1(r.def), rank: order.indexOf(abbr) + 1 || null, of: order.length },
      injuries: trimInjuries(injuries[abbr] || []),
    };
  }
  return out;
}
