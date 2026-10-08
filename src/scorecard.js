// Track 3's scorecard: how one model's own earlier picks were graded, as totals
// and leanings. No single game is named and no betting line appears; spread
// and total records are outcomes of grading, which the prompt already says the
// picks are graded on.
//
// A model's history is its track 2 picks until it has track 3 picks for a
// week, and its track 3 picks from then on, so the feedback follows the picks
// that were made with feedback.

const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// A move this many points off the ratings' margin counts as a real departure.
export const MOVE = 2;
// Confidence bands, as [from, to) in percent; the last one is closed at 100.
const BANDS = [[50, 60], [60, 70], [70, 80], [80, 101]];

// weeks: buildWeek() results for the weeks before the one being picked.
// base: the model's id without a track suffix, such as "gpt".
export function buildCard(weeks, base) {
  const rows = [];
  for (const w of weeks) {
    for (const g of w.games) {
      const cell = g.picks[`${base}-v3`] || g.picks[`${base}-v2`];
      if (g.status !== 'final' || !cell || !cell.grade || !g.v2) continue;
      const pred = cell.home_score - cell.away_score;
      const actual = g.homeScore - g.awayScore;
      rows.push({
        week: w.week, grade: cell.grade, pred, actual,
        confidence: cell.confidence,
        math: g.v2.math.margin,
        predTotal: cell.home_score + cell.away_score,
        total: g.homeScore + g.awayScore,
      });
    }
  }
  const n = rows.length;
  if (!n) return { games: 0 };
  const tally = (key, marks) => marks.map((m) => rows.filter((r) => r.grade[key] === m).length);
  const moved = rows.filter((r) => Math.abs(r.pred - r.math) >= MOVE);
  return {
    games: n,
    weeks: [Math.min(...rows.map((r) => r.week)), Math.max(...rows.map((r) => r.week))],
    su: tally('su', ['W', 'L']),
    ats: tally('ats', ['W', 'L', 'P']),
    ou: tally('ou', ['W', 'L', 'P']),
    miss: round(mean(rows.map((r) => r.grade.marginError)), 1),
    ratingsMiss: round(mean(rows.map((r) => Math.abs(r.math - r.actual))), 1),
    brier: round(mean(rows.map((r) => r.grade.brier)), 3),
    // Per band: how many picks, the average confidence stated, and how often they won.
    bands: BANDS.map(([from, to]) => {
      const inBand = rows.filter((r) => r.confidence * 100 >= from && r.confidence * 100 < to && r.grade.su !== 'T');
      return {
        from, to: Math.min(to, 100), n: inBand.length,
        stated: inBand.length ? Math.round(mean(inBand.map((r) => r.confidence)) * 100) : null,
        won: inBand.length ? Math.round(mean(inBand.map((r) => (r.grade.su === 'W' ? 1 : 0))) * 100) : null,
      };
    }),
    withRatings: rows.filter((r) => Math.sign(r.pred) === Math.sign(r.math)).length,
    moved: {
      n: moved.length,
      miss: round(mean(moved.map((r) => r.grade.marginError)), 1),
      ratingsMiss: round(mean(moved.map((r) => Math.abs(r.math - r.actual))), 1),
    },
    home: { picked: rows.filter((r) => r.pred > 0).length, won: rows.filter((r) => r.actual > 0).length },
    totals: { predicted: round(mean(rows.map((r) => r.predTotal)), 1), actual: round(mean(rows.map((r) => r.total)), 1) },
    // How far ahead the model had its winners, and how those teams really finished.
    margins: { predicted: round(mean(rows.map((r) => Math.abs(r.pred))), 1), actual: round(mean(rows.map((r) => Math.sign(r.pred) * r.actual)), 1) },
  };
}

// A band needs this many picks before its win rate is worth showing.
const BAND_MIN = 5;
const record = (r) => `${r[0]}-${r[1]}${r[2] ? `-${r[2]}` : ''}`;
const pts = (n) => n.toFixed(1);

// The scorecard as the lines a model reads.
export function cardText(card) {
  if (!card || !card.games) return 'YOUR SCORECARD\n  No graded games yet.';
  const span = card.weeks[0] === card.weeks[1] ? `week ${card.weeks[0]}` : `weeks ${card.weeks[0]} to ${card.weeks[1]}`;
  const bands = card.bands.map((b) => {
    const name = b.to === 100 ? `${b.from}% and up` : `${b.from}-${b.to - 1}%`;
    return b.n >= BAND_MIN ? `${name}: you averaged ${b.stated}% and won ${b.won}% (${b.n} picks)` : `${name}: too few picks to say (${b.n})`;
  });
  const lines = [
    `Record: ${record(card.su)} straight up, ${record(card.ats)} against the spread, ${record(card.ou)} on totals.`,
    `Margin miss: ${pts(card.miss)} points a game. The MODEL line on its own missed by ${pts(card.ratingsMiss)} on the same games.`,
    `Confidence: ${bands.join('; ')}.`,
    `MODEL line: you picked the same winner as it in ${card.withRatings} of ${card.games} games.` +
      (card.moved.n ? ` In the ${card.moved.n} game${card.moved.n === 1 ? '' : 's'} where you moved ${MOVE} or more points off its margin, you missed by ${pts(card.moved.miss)} and it missed by ${pts(card.moved.ratingsMiss)}.` : ` You never moved ${MOVE} or more points off its margin.`),
    `Home teams: you picked the home team in ${card.home.picked} of ${card.games} games; the home team won ${card.home.won}.`,
    `Totals: your predicted totals averaged ${pts(card.totals.predicted)} points; the real totals averaged ${pts(card.totals.actual)}.`,
    `Margins: you had your winners ahead by ${pts(card.margins.predicted)} on average; those teams finished ${card.margins.actual >= 0 ? `${pts(card.margins.actual)} ahead` : `${pts(Math.abs(card.margins.actual))} behind`} on average.`,
  ];
  return `YOUR SCORECARD (${card.games} graded games, ${span})\n${lines.map((l) => `  ${l}`).join('\n')}`;
}
