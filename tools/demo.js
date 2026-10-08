// Builds a throwaway demo season so the graded parts of the site can be seen
// before real games finish. It reuses the real week 5 picks as weeks 3 to 5,
// invents final scores, and writes everything to a scratch folder.
//
//   node tools/demo.js <scratch-dir>
//   PICKEM_DATA=<scratch-dir>/data PICKEM_SITE=<scratch-dir>/site node src/cli.js serve --port 8491
//
// It never touches data/ or docs/data.json.

import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
if (!out) {
  console.error('usage: node tools/demo.js <scratch-dir>');
  process.exit(1);
}
process.env.PICKEM_DATA = path.join(out, 'data');
process.env.PICKEM_SITE = path.join(out, 'site');

const { ROOT, fileSha, readJson, weekDir, writeJson } = await import('../src/store.js');
const { buildSite } = await import('../src/build.js');

const SEASON = 2026;
const source = path.join(ROOT, 'data', String(SEASON), 'week-05');

// Small seeded generator, so the demo looks the same every run.
let seed = 20261007;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const score = () => [3, 6, 10, 13, 16, 17, 20, 21, 23, 24, 26, 27, 30, 31, 34][Math.floor(rand() * 15)];

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'docs'), process.env.PICKEM_SITE, { recursive: true });

for (const week of [3, 4, 5]) {
  const dir = weekDir(SEASON, week);
  fs.cpSync(source, dir, { recursive: true });
  const slate = readJson(path.join(dir, 'slate.json'));
  writeJson(path.join(dir, 'slate.json'), { ...slate, week });
  const lines = readJson(path.join(dir, 'lines.json'), { games: {} });

  // Give the old picks the newer optional fields, then re-lock them.
  const lock = { files: {} };
  for (const name of fs.readdirSync(path.join(dir, 'picks'))) {
    const file = path.join(dir, 'picks', name);
    const entry = readJson(file);
    const bold = [...entry.picks].sort((a, b) => b.confidence - a.confidence);
    entry.week = week;
    entry.lock = bold[0].game;
    entry.upset = bold[Math.floor(rand() * bold.length)].game;
    for (const p of entry.picks) {
      p.first_half = p.winner;
      p.factors = ['Scoring gap over four weeks', 'Better record', 'Opponent on a losing run'].slice(0, 2 + Math.floor(rand() * 2));
    }
    writeJson(file, entry);
    lock.files[name] = { sha256: fileSha(file), lockedAt: entry.pickedAt };
  }
  writeJson(path.join(dir, 'lock.json'), lock);

  // Weeks 3 and 4 are complete; week 5 is half played.
  const results = { season: SEASON, week, games: {} };
  slate.games.forEach((g, i) => {
    const done = week < 5 || i < 7;
    let away = score();
    let home = score();
    if (away === home) home += 3;
    results.games[g.key] = done
      ? { status: 'final', awayScore: away, homeScore: home, awayHalf: Math.floor(away / 2), homeHalf: Math.ceil(home / 2), line: lines.games[g.key] ? { ...lines.games[g.key], source: 'closing' } : null }
      : { status: 'scheduled', awayScore: null, homeScore: null, line: null };
  });
  writeJson(path.join(dir, 'results.json'), results);
  writeJson(path.join(dir, 'checks.json'), {
    checker: 'demo-checker',
    flags: [{ game: 'LV@NE', model: 'local', claim: 'New England has struggled at home.', evidence: 'NE is 1-0 at home.' }],
  });
}

const data = buildSite(SEASON);
console.log(`demo season written to ${out}: ${data.weeks.length} weeks, ${data.contestants.length} contestants`);
