// Walk-forward test of track 2's math on past seasons: every week is predicted
// from the games before it, never after. Prints how the frozen parameters in
// src/ratings.js do, next to track 1's data used as a plain formula.
//
//   node tools/backtest.js            fit seasons 2021-2024, check season 2025
//   node tools/backtest.js --search   also rerun the parameter search

import { PARAMS, buildRatings, normalCdf } from '../src/ratings.js';
import { loadHistory } from '../src/store.js';

const history = loadHistory(9999);
if (history.length < 2) {
  console.error('no seasons in data/history; run tools/history.js first');
  process.exit(1);
}
const FIT = history.slice(1, -1).map((s) => s.season);
const CHECK = [history[history.length - 1].season];

// Predicted home margin for every game from the second season on.
function walk(params) {
  const out = new Map();
  history.forEach((cur, i) => {
    if (!i) return;
    for (let week = 1; week <= 18; week++) {
      const slate = cur.games.filter((g) => g.week === week);
      if (!slate.length) continue;
      const seen = { season: cur.season, games: cur.games.filter((g) => g.week < week) };
      const { predict } = buildRatings([...history.slice(0, i), seen], params);
      for (const g of slate) out.set(g, predict(g.home, g.away, g.neutral));
    }
  });
  return out;
}

// Track 1's data sheet as a formula: season points for and against, no home edge.
function naive() {
  const out = new Map();
  for (const cur of history.slice(1)) {
    const t = {};
    for (let week = 1; week <= 18; week++) {
      const slate = cur.games.filter((g) => g.week === week);
      for (const g of slate) {
        const h = t[g.home];
        const a = t[g.away];
        const margin = h && a ? (h.pf / h.n + a.pa / a.n) / 2 - (a.pf / a.n + h.pa / h.n) / 2 : 0;
        out.set(g, { margin });
      }
      for (const g of slate) {
        for (const [team, pf, pa] of [[g.home, g.homeScore, g.awayScore], [g.away, g.awayScore, g.homeScore]]) {
          const r = (t[team] ??= { pf: 0, pa: 0, n: 0 });
          r.pf += pf; r.pa += pa; r.n++;
        }
      }
    }
  }
  return out;
}

function score(preds, seasons, sigma) {
  let n = 0, miss = 0, brier = 0, right = 0;
  for (const cur of history) {
    if (!seasons.includes(cur.season)) continue;
    for (const g of cur.games) {
      const p = preds.get(g);
      if (!p) continue;
      const actual = g.homeScore - g.awayScore;
      const prob = Math.min(0.99, Math.max(0.01, normalCdf(p.margin / sigma)));
      n++;
      miss += Math.abs(p.margin - actual);
      brier += (prob - (actual > 0 ? 1 : actual < 0 ? 0 : 0.5)) ** 2;
      right += actual === 0 ? 0.5 : (p.margin > 0) === (actual > 0) ? 1 : 0;
    }
  }
  return { n, miss: miss / n, brier: brier / n, right: right / n };
}

const show = (label, preds, sigma) => {
  const line = (s) => `${s.n} games, margin miss ${s.miss.toFixed(2)}, Brier ${s.brier.toFixed(4)}, winners ${(100 * s.right).toFixed(1)}%`;
  console.log(`${label}\n  fit   ${FIT[0]}-${FIT[FIT.length - 1]}: ${line(score(preds, FIT, sigma))}\n  check ${CHECK[0]}:      ${line(score(preds, CHECK, sigma))}`);
};

show("Track 1's data as a formula (sigma 17)", naive(), 17);
show(`Track 2 math, frozen parameters (sigma ${PARAMS.sigma})`, walk(PARAMS), PARAMS.sigma);

if (process.argv.includes('--search')) {
  // One parameter at a time, two passes, scored by margin miss on the fit seasons only.
  const grids = {
    'elo.k': [12, 16, 20, 24, 28], 'elo.carry': [0.5, 0.6, 0.7, 0.8], 'elo.home': [1, 1.5, 2, 2.5],
    'ridge.lambda': [2, 4, 6, 9, 13], 'ridge.carry': [0.3, 0.45, 0.6, 0.75, 0.9], 'ridge.home': [1, 1.5, 2, 2.5],
  };
  const best = structuredClone(PARAMS);
  for (let pass = 0; pass < 2; pass++) {
    for (const [key, values] of Object.entries(grids)) {
      const [group, name] = key.split('.');
      const tried = values.map((v) => {
        const p = structuredClone(best);
        p[group][name] = v;
        return { v, miss: score(walk(p), FIT, p.sigma).miss };
      });
      best[group][name] = tried.reduce((a, b) => (b.miss < a.miss ? b : a)).v;
      console.log(`pass ${pass + 1} ${key}: ${tried.map((t) => `${t.v}=${t.miss.toFixed(3)}`).join('  ')}`);
    }
  }
  const preds = walk(best);
  const sigmas = Array.from({ length: 21 }, (_, i) => 9 + i / 2).map((s) => ({ s, brier: score(preds, FIT, s).brier }));
  best.sigma = sigmas.reduce((a, b) => (b.brier < a.brier ? b : a)).s;
  console.log('search result:', JSON.stringify(best));
  show('Track 2 math, searched parameters', preds, best.sigma);
}
