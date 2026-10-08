// node test/selftest.js: offline checks of the line parser, prompt, validator and grading.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pickem-'));
process.env.PICKEM_DATA = path.join(tmp, 'data');
process.env.PICKEM_SITE = path.join(tmp, 'site');

const { parseLine, normalizeGames } = await import('../src/espn.js');
const { buildDossiers } = await import('../src/features.js');
const { buildPrompt, parsePicks } = await import('../src/prompt.js');
const { gradePick, baselinePick } = await import('../src/grade.js');
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

const mock = await runModel({ id: 'mock', provider: 'mock', model: 'mock' }, prompt, slate.games);
check('runModel: mock backend round-trips through the validator', () => assert.equal(mock.picks.length, 2));

// End to end on disk: a locked entry, a late entry, and a tampered one.
const dir = weekDir(2099, 2);
writeJson(path.join(dir, 'slate.json'), slate);
const entry = (id, pickedAt) => ({ id, label: id, provider: 'mock', model: 'mock', pickedAt, picks: mock.picks });
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

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${n} checks passed`);
