// Pure grading math. Lines are always the home team's line (negative = home favored).

// pick: { away_score, home_score, confidence, spread? }, final: { awayScore, homeScore },
// line: { homeLine } or null. shown: the line a track 4 pick was made against.
export function gradePick(pick, final, line, { ats: gradeAts = true, ou: gradeOu = true, shown = null } = {}) {
  const predMargin = pick.home_score - pick.away_score;
  const margin = final.homeScore - final.awayScore;
  const su = margin === 0 ? 'T' : Math.sign(predMargin) === Math.sign(margin) ? 'W' : 'L';

  // The ATS side is implied: whichever team the predicted margin says covers.
  // A track 4 pick names its side instead, and a pass is not graded.
  let ats = null;
  let atsSide = null;
  let clv = null;
  const pass = pick.spread === 'pass';
  if (gradeAts && line && Number.isFinite(line.homeLine) && !pass) {
    const edge = predMargin + line.homeLine;
    atsSide = pick.spread || (edge > 0 ? 'home' : edge < 0 ? 'away' : null);
    const cover = margin + line.homeLine;
    if (atsSide) ats = cover === 0 ? 'P' : (cover > 0) === (atsSide === 'home') ? 'W' : 'L';
    // Closing line value: points the line moved toward the side taken after the
    // pick was made. Positive means the market came around to the pick.
    if (pick.spread && shown && Number.isFinite(shown.homeLine) && line.source === 'closing') {
      const toHome = shown.homeLine - line.homeLine;
      clv = atsSide === 'home' ? toHome : -toHome;
    }
  }

  // Over/under is implied the same way: predicted total against the posted total.
  let ou = null;
  let ouSide = null;
  if (gradeOu && line && Number.isFinite(line.total)) {
    const predTotal = pick.home_score + pick.away_score;
    const total = final.homeScore + final.awayScore;
    ouSide = predTotal > line.total ? 'over' : predTotal < line.total ? 'under' : null;
    if (ouSide) ou = total === line.total ? 'P' : (total > line.total) === (ouSide === 'over') ? 'W' : 'L';
  }

  const teamHits = (pick.away_score === final.awayScore ? 1 : 0) + (pick.home_score === final.homeScore ? 1 : 0);
  const pHome = predMargin > 0 ? pick.confidence : 1 - pick.confidence;
  const outcome = margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
  return {
    su,
    ats,
    atsSide,
    ...(pick.spread ? { pass, clv } : {}),
    ou,
    ouSide,
    exact: teamHits === 2,
    teamHits,
    brier: (pHome - outcome) ** 2,
    marginError: Math.abs(predMargin - margin),
  };
}

// First-half pick: the team named against the halftime score. A tie at the half is a push.
export function gradeFirstHalf(pick, game, final) {
  if (!pick.first_half || final.homeHalf == null || final.awayHalf == null) return null;
  const lead = final.homeHalf - final.awayHalf;
  if (lead === 0) return 'P';
  return (lead > 0) === (pick.first_half === game.home) ? 'W' : 'L';
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
  // passes and clv (beat / same / worse than the close) only move on track 4.
  return { n: 0, su: [0, 0, 0], ats: [0, 0, 0], atsN: 0, ou: [0, 0, 0], ouN: 0, fh: [0, 0, 0], lock: [0, 0], upset: [0, 0], exact: 0, teamHits: 0, brierSum: 0, marginErrorSum: 0, passes: 0, clv: [0, 0, 0] };
}

export function addGrade(t, g) {
  t.n++;
  t.su[{ W: 0, L: 1, T: 2 }[g.su]]++;
  if (g.ats) { t.ats[{ W: 0, L: 1, P: 2 }[g.ats]]++; t.atsN++; }
  if (g.ou) { t.ou[{ W: 0, L: 1, P: 2 }[g.ou]]++; t.ouN++; }
  if (g.fh) t.fh[{ W: 0, L: 1, P: 2 }[g.fh]]++;
  if (g.pass) t.passes++;
  if (g.clv != null) t.clv[g.clv > 0 ? 0 : g.clv === 0 ? 1 : 2]++;
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
    ou: a.ou.map((x, i) => x + b.ou[i]),
    ouN: a.ouN + b.ouN,
    fh: a.fh.map((x, i) => x + b.fh[i]),
    passes: a.passes + b.passes,
    clv: a.clv.map((x, i) => x + b.clv[i]),
    lock: a.lock.map((x, i) => x + b.lock[i]),
    upset: a.upset.map((x, i) => x + b.upset[i]),
    exact: a.exact + b.exact,
    teamHits: a.teamHits + b.teamHits,
    brierSum: a.brierSum + b.brierSum,
    marginErrorSum: a.marginErrorSum + b.marginErrorSum,
  };
}
