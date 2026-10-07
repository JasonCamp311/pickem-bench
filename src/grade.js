// Pure grading math. Lines are always the home team's line (negative = home favored).

// pick: { away_score, home_score, confidence }, final: { awayScore, homeScore },
// line: { homeLine } or null.
export function gradePick(pick, final, line, { ats: gradeAts = true } = {}) {
  const predMargin = pick.home_score - pick.away_score;
  const margin = final.homeScore - final.awayScore;
  const su = margin === 0 ? 'T' : Math.sign(predMargin) === Math.sign(margin) ? 'W' : 'L';

  // The ATS side is implied: whichever team the predicted margin says covers.
  let ats = null;
  let atsSide = null;
  if (gradeAts && line && Number.isFinite(line.homeLine)) {
    const edge = predMargin + line.homeLine;
    atsSide = edge > 0 ? 'home' : edge < 0 ? 'away' : null;
    const cover = margin + line.homeLine;
    if (atsSide) ats = cover === 0 ? 'P' : (cover > 0) === (atsSide === 'home') ? 'W' : 'L';
  }

  const teamHits = (pick.away_score === final.awayScore ? 1 : 0) + (pick.home_score === final.homeScore ? 1 : 0);
  const pHome = predMargin > 0 ? pick.confidence : 1 - pick.confidence;
  const outcome = margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
  return {
    su,
    ats,
    atsSide,
    exact: teamHits === 2,
    teamHits,
    brier: (pHome - outcome) ** 2,
    marginError: Math.abs(predMargin - margin),
  };
}

// Reference picks that need no model. Without them a win-loss record has no context.
export const BASELINES = [
  { id: 'base-home', label: 'Always home', note: 'Home team by 3, every game.' },
  { id: 'base-favorite', label: 'Always favorite', note: 'Whoever the closing line favors. Straight-up only.' },
];

export function baselinePick(id, line) {
  if (id === 'base-home') return { pick: { away_score: 20, home_score: 23, confidence: 0.57 }, ats: true };
  if (id === 'base-favorite') {
    if (!line || !Number.isFinite(line.homeLine)) return null;
    const homeFav = line.homeLine <= 0;
    return { pick: { away_score: homeFav ? 20 : 23, home_score: homeFav ? 23 : 20, confidence: 0.65 }, ats: false };
  }
  return null;
}

export function emptyTotals() {
  return { n: 0, su: [0, 0, 0], ats: [0, 0, 0], atsN: 0, exact: 0, teamHits: 0, brierSum: 0, marginErrorSum: 0 };
}

export function addGrade(t, g) {
  t.n++;
  t.su[{ W: 0, L: 1, T: 2 }[g.su]]++;
  if (g.ats) { t.ats[{ W: 0, L: 1, P: 2 }[g.ats]]++; t.atsN++; }
  if (g.exact) t.exact++;
  t.teamHits += g.teamHits;
  t.brierSum += g.brier;
  t.marginErrorSum += g.marginError;
  return t;
}

export function mergeTotals(a, b) {
  return {
    n: a.n + b.n,
    su: a.su.map((x, i) => x + b.su[i]),
    ats: a.ats.map((x, i) => x + b.ats[i]),
    atsN: a.atsN + b.atsN,
    exact: a.exact + b.exact,
    teamHits: a.teamHits + b.teamHits,
    brierSum: a.brierSum + b.brierSum,
    marginErrorSum: a.marginErrorSum + b.marginErrorSum,
  };
}
