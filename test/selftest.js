// node test/selftest.js: offline checks of the line parser, prompt, validator and grading.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pickem-'));
process.env.PICKEM_DATA = path.join(tmp, 'data');
process.env.PICKEM_SITE = path.join(tmp, 'site');

const { parseLine, normalizeGames } = await import('../src/espn.js');
const { buildDossiers, buildDossiersV2 } = await import('../src/features.js');
const { PARAMS, buildRatings, normalCdf } = await import('../src/ratings.js');
const { buildPrompt, parseExtras, parsePicks } = await import('../src/prompt.js');
const { gradeFirstHalf, gradePick, baselinePick } = await import('../src/grade.js');
const { runModel } = await import('../src/providers.js');
const { buildSite } = await import('../src/build.js');
const { weekDir, writeJson, fileSha } = await import('../src/store.js');

let n = 0;
const check = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };

const event = (id, date, away, home, as, hs, state, odds) => ({
  id, date,
  competitions: [{
    neutralSite: false, venue: { indoor: false },
    status: { type: { state, name: state === 'post' ? 'STATUS_FINAL' : 'STATUS_SCHEDULED', completed: state === 'post' } },
    competitors: [
      { homeAway: 'home', score: String(hs), team: { abbreviation: home, displayName: home } },
      { homeAway: 'away', score: String(as), team: { abbreviation: away, displayName: away } },
    ],
    ...(odds ? { odds: [odds] } : {}),
  }],
});

check('parseLine: home favorite', () => assert.equal(parseLine({ details: 'DAL -8.5', spread: -8.5, overUnder: 47.5 }, 'DAL', 'TB').homeLine, -8.5));
check('parseLine: away favorite, ESPN summary sign', () => assert.equal(parseLine({ details: 'PIT -2.5', spread: 2.5 }, 'CLE', 'PIT').homeLine, 2.5));
check('parseLine: moneylines from scoreboard and summary shapes', () => {
  const board = parseLine({ details: 'NE -3.5', moneyline: { home: { close: { odds: '-180' } }, away: { close: { odds: '+150' } } } }, 'NE', 'LV');
  assert.deepEqual([board.homeMoneyline, board.awayMoneyline], [-180, 150]);
  const summary = parseLine({ details: 'PIT -2.5', homeTeamOdds: { moneyLine: 124 }, awayTeamOdds: { moneyLine: -148 } }, 'CLE', 'PIT');
  assert.deepEqual([summary.homeMoneyline, summary.awayMoneyline], [124, -148]);
  assert.equal(parseLine({ details: 'NE -3.5' }, 'NE', 'LV').homeMoneyline, null);
});
check('parseLine: pick\'em and missing', () => {
  assert.equal(parseLine({ details: 'EVEN' }, 'A', 'B').homeLine, 0);
  assert.equal(parseLine(null, 'A', 'B'), null);
  assert.equal(parseLine({ details: '' }, 'A', 'B'), null);
});

const wk1 = normalizeGames({ events: [event('1', '2026-09-13T17:00Z', 'TB', 'DAL', 17, 27, 'post'), event('2', '2026-09-13T17:00Z', 'PIT', 'CLE', 24, 27, 'post')] });
const wk2raw = { events: [event('3', '2099-09-20T17:00Z', 'DAL', 'CLE', 0, 0, 'pre', { details: 'CLE -3', spread: -3 }), event('4', '2099-09-20T17:00Z', 'PIT', 'TB', 0, 0, 'pre')] };
const wk2 = normalizeGames(wk2raw);

check('normalizeGames: keys, status, scores', () => {
  assert.equal(wk1[0].key, 'TB@DAL');
  assert.equal(wk1[0].status, 'final');
  assert.equal(wk1[0].homeScore, 27);
  assert.equal(wk2[0].status, 'scheduled');
  assert.equal(wk2[0].homeScore, null);
});

const teams = buildDossiers([{ week: 1, games: wk1 }], wk2);
check('dossiers: records and scoring', () => {
  assert.equal(teams.DAL.record, '1-0');
  assert.equal(teams.DAL.homeRecord, '1-0');
  assert.equal(teams.TB.roadRecord, '0-1');
  assert.equal(teams.CLE.pointsFor, 27);
  assert.equal(teams.PIT.streak, 'L1');
});

const slate = { season: 2099, week: 2, games: wk2.map(({ status, awayScore, homeScore, ...g }) => g), teams };
const prompt = buildPrompt(slate);
check('prompt: lists every game and carries no betting line', () => {
  assert.match(prompt.user, /GAME DAL@CLE/);
  assert.match(prompt.user, /GAME PIT@TB/);
  assert.doesNotMatch(prompt.user, /CLE -3|spread|odds|over\/under|moneyline/i);
  assert.doesNotMatch(JSON.stringify(slate), /spread|odds/i);
});

// Track 2: ratings from scores, the sheet built on them, and its prompt.
const past = { season: 2098, games: [
  { week: 1, kickoff: '2098-09-07T17:00:00Z', away: 'DAL', home: 'PIT', awayScore: 31, homeScore: 10, neutral: false },
  { week: 1, kickoff: '2098-09-07T20:00:00Z', away: 'TB', home: 'CLE', awayScore: 17, homeScore: 20, neutral: false },
] };
const finals = wk1.filter((g) => g.status === 'final').map((g) => ({ ...g, week: 1 }));
const ratings = buildRatings([past, { season: 2099, games: finals }]);
check('ratings: winners rate above losers and the home team gets an edge', () => {
  assert.ok(ratings.teams.DAL.power > ratings.teams.PIT.power);
  const home = ratings.predict('DAL', 'CLE');
  const away = ratings.predict('CLE', 'DAL');
  assert.ok(Math.abs(home.margin + away.margin - 2 * PARAMS.ridge.home) < 1e-9);
  assert.equal(ratings.predict('DAL', 'CLE', true).margin, (home.margin - away.margin) / 2);
  assert.ok(Math.abs(home.homePoints - home.awayPoints - home.margin) < 1e-9);
  assert.ok(Math.abs(home.homeWin - normalCdf(home.margin / PARAMS.sigma)) < 1e-12);
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-7 && Math.abs(normalCdf(1.96) - 0.975) < 1e-4);
});
check('ratings: a rating fades toward average over an offseason', () => {
  const later = buildRatings([past, { season: 2099, games: [] }]);
  const then = buildRatings([past]);
  assert.ok(Math.abs(later.teams.DAL.power) < Math.abs(then.teams.DAL.power));
});
const injuries = { DAL: [
  { name: 'A Guard', pos: 'G', status: 'Questionable' }, { name: 'B Passer', pos: 'QB', status: 'Questionable' }, { name: 'C End', pos: 'DE', status: 'Out' },
  ...['D', 'E', 'F', 'G'].map((n) => ({ name: `${n} Extra`, pos: 'WR', status: 'Questionable' })),
] };
const math = Object.fromEntries(wk2.map((g) => [g.key, { margin: 2.5, total: 44, homePoints: 23.3, awayPoints: 20.8, homeWin: 0.59 }]));
const slateV2 = { ...slate, track: 'v2', params: PARAMS, teams: buildDossiersV2([{ week: 1, games: wk1 }], wk2, past, ratings, injuries), math };
check('track 2 sheet: last season, ratings and a capped injury list, quarterback first', () => {
  assert.equal(slateV2.teams.DAL.lastSeason.record, '1-0');
  assert.equal(slateV2.teams.DAL.injuries.length, 6);
  assert.equal(slateV2.teams.DAL.injuries[0].pos, 'QB');
  assert.equal(slateV2.teams.DAL.injuries[1].status, 'Out');
  assert.equal(slateV2.teams.CLE.injuries.length, 0);
});
check('track 2 prompt: shows the ratings line and still no betting line', () => {
  const p2 = buildPrompt(slateV2);
  assert.match(p2.user, /MODEL: DAL 20.8, CLE 23.3 \| CLE by 2.5 \| CLE wins 59%/);
  assert.match(p2.user, /injuries: B Passer QB \(Questionable\)/);
  assert.match(p2.system, /home edge of 1.5 points/);
  assert.doesNotMatch(p2.user, /spread|odds|over\/under|moneyline|predictor|pickcenter/i);
  assert.doesNotMatch(JSON.stringify(slateV2), /spread|odds|moneyline|predictor/i);
});

const good = '```json\n{"picks":[{"game":"DAL@CLE","away_score":20,"home_score":24,"confidence":0.6,"reason":"x"},{"game":"PIT@TB","away_score":27,"home_score":13,"confidence":0.8,"reason":"y"}]}\n```';
check('parsePicks: accepts a fenced reply and derives the winner', () => {
  const picks = parsePicks(good, slate.games);
  assert.equal(picks.length, 2);
  assert.equal(picks[0].winner, 'CLE');
  assert.equal(picks[1].winner, 'PIT');
  assert.deepEqual(picks[0].factors, []);
  const withFactors = parsePicks(good.replace('"reason":"x"', '"reason":"x","factors":["a","b","c","d"]'), slate.games);
  assert.deepEqual(withFactors[0].factors, ['a', 'b', 'c']);
});
check('parsePicks: rejects ties, missing games, bad confidence, strangers', () => {
  assert.throws(() => parsePicks('{"picks":[{"game":"DAL@CLE","away_score":20,"home_score":20,"confidence":0.6}]}', slate.games), /tied.*PIT@TB: missing/);
  assert.throws(() => parsePicks(good.replace('0.8', '80'), slate.games), /confidence/);
  assert.throws(() => parsePicks(good.replace('PIT@TB', 'PIT@NYJ'), slate.games), /not a game/);
  assert.throws(() => parsePicks('sorry, no', slate.games), /not valid JSON/);
});

check('gradePick: straight up, ATS, exact, Brier', () => {
  const final = { awayScore: 20, homeScore: 24 };
  const g = gradePick({ away_score: 20, home_score: 24, confidence: 0.6 }, final, { homeLine: -3 });
  assert.deepEqual([g.su, g.ats, g.atsSide, g.exact, g.teamHits], ['W', 'W', 'home', true, 2]);
  assert.ok(Math.abs(g.brier - 0.16) < 1e-9);
  // Right winner, wrong side of the number.
  const g2 = gradePick({ away_score: 21, home_score: 23, confidence: 0.55 }, final, { homeLine: -3 });
  assert.deepEqual([g2.su, g2.ats, g2.atsSide], ['W', 'L', 'away']);
  // Wrong winner still covers when the dog loses close.
  const g3 = gradePick({ away_score: 24, home_score: 20, confidence: 0.7 }, { awayScore: 20, homeScore: 22 }, { homeLine: -3 });
  assert.deepEqual([g3.su, g3.ats], ['L', 'W']);
});
check('gradePick: push, no line, no ATS opinion', () => {
  const final = { awayScore: 20, homeScore: 23 };
  assert.equal(gradePick({ away_score: 10, home_score: 20, confidence: 0.6 }, final, { homeLine: -3 }).ats, 'P');
  assert.equal(gradePick({ away_score: 10, home_score: 20, confidence: 0.6 }, final, null).ats, null);
  assert.equal(gradePick({ away_score: 20, home_score: 23, confidence: 0.6 }, final, { homeLine: -3 }).ats, null);
});
check('gradePick: over/under is implied from the predicted total', () => {
  const final = { awayScore: 20, homeScore: 24 };
  const over = gradePick({ away_score: 27, home_score: 24, confidence: 0.6 }, final, { homeLine: -3, total: 47.5 });
  assert.deepEqual([over.ouSide, over.ou], ['over', 'L']);
  const under = gradePick({ away_score: 17, home_score: 20, confidence: 0.6 }, final, { homeLine: -3, total: 47.5 });
  assert.deepEqual([under.ouSide, under.ou], ['under', 'W']);
  assert.equal(gradePick({ away_score: 17, home_score: 20, confidence: 0.6 }, final, { homeLine: -3, total: 44 }).ou, 'P');
  assert.equal(gradePick({ away_score: 17, home_score: 20, confidence: 0.6 }, final, { homeLine: -3 }).ou, null);
});
check('baselines: favorite follows the line and has no ATS side', () => {
  assert.equal(baselinePick('base-favorite', null), null);
  const b = baselinePick('base-favorite', { homeLine: 4.5 });
  assert.ok(b.pick.away_score > b.pick.home_score);
  assert.equal(gradePick(b.pick, { awayScore: 30, homeScore: 10 }, { homeLine: 4.5 }, { ats: b.ats }).ats, null);
});

check('first half, lock and upset fields are optional and validated', () => {
  const reply = '{"lock":"pit@tb","upset":"NOPE","picks":[{"game":"DAL@CLE","away_score":20,"home_score":24,"confidence":0.6,"first_half":"dal"},{"game":"PIT@TB","away_score":27,"home_score":13,"confidence":0.8,"first_half":"XYZ"}]}';
  const picks = parsePicks(reply, slate.games);
  assert.deepEqual([picks[0].first_half, picks[1].first_half], ['DAL', null]);
  assert.deepEqual(parseExtras(reply, slate.games), { lock: 'PIT@TB', upset: null });
  assert.deepEqual(parseExtras('nope', slate.games), { lock: null, upset: null });
  const g = { home: 'CLE', away: 'DAL' };
  assert.equal(gradeFirstHalf({ first_half: 'DAL' }, g, { awayHalf: 10, homeHalf: 7 }), 'W');
  assert.equal(gradeFirstHalf({ first_half: 'DAL' }, g, { awayHalf: 7, homeHalf: 7 }), 'P');
  assert.equal(gradeFirstHalf({ first_half: null }, g, { awayHalf: 10, homeHalf: 7 }), null);
  assert.equal(gradeFirstHalf({ first_half: 'CLE' }, g, { awayHalf: null, homeHalf: null }), null);
});

const mock = await runModel({ id: 'mock', provider: 'mock', model: 'mock' }, prompt, slate.games);
check('runModel: mock backend round-trips through the validator', () => assert.equal(mock.picks.length, 2));

// End to end on disk: a locked entry, a late entry, and a tampered one.
const dir = weekDir(2099, 2);
writeJson(path.join(dir, 'slate.json'), slate);
const entry = (id, pickedAt) => ({ id, label: id, provider: 'mock', model: 'mock', pickedAt, lock: 'DAL@CLE', upset: 'DAL@CLE', picks: mock.picks });
const lock = { files: {} };
for (const [id, at] of [['gpt', '2099-09-19T00:00:00Z'], ['late', '2099-09-21T00:00:00Z'], ['edited', '2099-09-19T00:00:00Z']]) {
  const file = path.join(dir, 'picks', `${id}.json`);
  writeJson(file, entry(id, at));
  lock.files[`${id}.json`] = { sha256: fileSha(file), lockedAt: at };
}
writeJson(path.join(dir, 'lock.json'), lock);
writeJson(path.join(dir, 'picks', 'edited.json'), { ...entry('edited', '2099-09-19T00:00:00Z'), note: 'changed after lock' });
writeJson(path.join(dir, 'results.json'), { games: {
  'DAL@CLE': { status: 'final', awayScore: 20, homeScore: 23, line: { homeLine: -6.5, source: 'closing' } },
  'PIT@TB': { status: 'scheduled', awayScore: null, homeScore: null, line: null },
} });
// Track 2 sits in the same week folder: its own slate, ids ending in -v2, and
// the code-only contestant as one more locked file.
writeJson(path.join(dir, 'slate-v2.json'), slateV2);
const far = { ...mock.picks[0], away_score: 10, home_score: 30 };
for (const [id, picks] of [['gpt-v2', mock.picks], ['claude-v2', [far, mock.picks[1]]], ['math-v2', mock.picks]]) {
  const file = path.join(dir, 'picks', `${id}.json`);
  writeJson(file, { ...entry(id, '2099-09-19T00:00:00Z'), picks });
  lock.files[`${id}.json`] = { sha256: fileSha(file), lockedAt: '2099-09-19T00:00:00Z' };
}
writeJson(path.join(dir, 'lock.json'), lock);
const data = buildSite(2099);
const week = data.weeks[0];
check('build: grades finals only, drops late picks, flags tampering', () => {
  assert.deepEqual(week.totals.gpt.su, [1, 0, 0]);
  assert.deepEqual(week.totals.gpt.ats, [1, 0, 0]); // home by 3 against -6.5 is the away side, which covered
  assert.equal(week.totals.gpt.exact, 1);
  assert.equal(week.totals.late, undefined);
  assert.equal(week.entries.gpt.intact, true);
  assert.equal(week.entries.edited.intact, false);
  assert.deepEqual(week.totals['base-favorite'].su, [1, 0, 0]);
  assert.equal(week.totals['base-favorite'].atsN, 0);
  assert.equal(week.games[1].picks.gpt.grade, undefined);
  assert.ok(fs.existsSync(path.join(process.env.PICKEM_SITE, 'data.json')));
});
check('build: consensus, lock and upset calls, method page', () => {
  assert.deepEqual(week.totals.consensus.su, [1, 0, 0]);
  assert.equal(week.games[0].picks.consensus.winner, 'CLE');
  assert.deepEqual(week.totals.gpt.lock, [1, 0]);
  // CLE won, but as the favorite, so it was not an upset.
  assert.deepEqual(week.totals.gpt.upset, [0, 1]);
  assert.equal(week.entries.gpt.lock.result, 'W');
  assert.match(data.method.sample, /GAME DAL@CLE/);
  assert.ok(data.contestants.some((c) => c.kind === 'baseline'));
});
check('build: tracks keep their own consensus and the ratings stay out of it', () => {
  const ids = Object.fromEntries(data.contestants.map((c) => [c.id, c]));
  assert.equal(ids['gpt-v2'].track, 'v2');
  assert.equal(ids.gpt.track, 'v1');
  assert.equal(ids['math-v2'].kind, 'math');
  assert.equal(ids['base-home'].track, undefined);
  // v1 consensus is unchanged by the v2 files; v2 averages its two models only.
  assert.equal(week.games[0].picks.consensus.home_score, 23);
  assert.equal(week.games[0].picks['consensus-v2'].home_score, 26.5);
  assert.equal(week.entries['math-v2'].intact, true);
  assert.equal(week.games[0].v2.math.margin, 2.5);
  assert.match(data.methodV2.sample, /MODEL: DAL/);
  assert.match(data.method.sample, /GAME DAL@CLE/);
  assert.doesNotMatch(data.method.sample, /MODEL:/);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${n} checks passed`);
