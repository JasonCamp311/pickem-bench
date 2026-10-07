#!/usr/bin/env node
// pickem-bench: slate -> pick -> lines -> grade -> build.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fetchClosingLine, fetchCurrent, fetchWeek, linesFromScoreboard, normalizeGames } from './espn.js';
import { buildDossiers } from './features.js';
import { buildPrompt } from './prompt.js';
import { providerProblem, runModel } from './providers.js';
import { buildSite } from './build.js';
import { SITE, fileSha, loadModels, readJson, sha256, weekDir, writeJson } from './store.js';

try { process.loadEnvFile(); } catch { /* no .env is fine */ }

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    out[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}

async function resolveWeek(opts) {
  if (opts.week && opts.season) return { season: Number(opts.season), week: Number(opts.week) };
  const cur = await fetchCurrent();
  if (!opts.week && cur.seasonType !== 2) throw new Error('not in the regular season; pass --season and --week');
  return { season: Number(opts.season || cur.season), week: Number(opts.week || cur.week) };
}

const picksDir = (dir) => path.join(dir, 'picks');
const hasPicks = (dir) => fs.existsSync(picksDir(dir)) && fs.readdirSync(picksDir(dir)).length > 0;

async function cmdSlate(opts) {
  const { season, week } = await resolveWeek(opts);
  const dir = weekDir(season, week);
  const file = path.join(dir, 'slate.json');
  // Every model must see the same prompt, so the slate freezes at the first pick.
  if (fs.existsSync(file) && hasPicks(dir)) {
    console.log(`week ${week}: slate is frozen (picks exist)`);
    return readJson(file);
  }
  const games = normalizeGames(await fetchWeek(season, week)).filter((g) => g.status !== 'off');
  const prior = [];
  for (let w = 1; w < week; w++) prior.push({ week: w, games: normalizeGames(await fetchWeek(season, w)) });
  const slate = {
    season,
    week,
    builtAt: new Date().toISOString(),
    games: games.map(({ status, awayScore, homeScore, ...g }) => g).sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.key.localeCompare(b.key)),
    teams: buildDossiers(prior, games),
  };
  writeJson(file, slate);
  console.log(`week ${week}: slate built, ${slate.games.length} games`);
  return slate;
}

async function cmdPick(opts) {
  const { season, week } = await resolveWeek(opts);
  const dir = weekDir(season, week);
  const slate = await cmdSlate({ season, week });
  const now = Date.now();
  const open = slate.games.filter((g) => Date.parse(g.kickoff) > now);
  if (!open.length) throw new Error(`week ${week}: every game has kicked off, nothing left to pick`);
  if (open.length < slate.games.length) console.log(`week ${week}: ${slate.games.length - open.length} game(s) already kicked off and are skipped`);

  const prompt = buildPrompt(slate, open);
  const promptSha256 = sha256(`${prompt.system}\n${prompt.user}`);
  const lockFile = path.join(dir, 'lock.json');
  const lock = readJson(lockFile, { files: {} });
  let failed = 0;

  const models = loadModels().filter((m) => !opts.model || String(opts.model).split(',').includes(m.id));
  if (!models.length) throw new Error('no matching models in models.json');
  for (const model of models) {
    const name = `${model.id}.json`;
    const file = path.join(picksDir(dir), name);
    if (fs.existsSync(file)) { console.log(`${model.id}: already locked`); continue; }
    const problem = providerProblem(model);
    if (problem) { console.log(`${model.id}: skipped (${problem})`); continue; }
    process.stdout.write(`${model.id}: asking ${model.model} ... `);
    try {
      const started = Date.now();
      const res = await runModel(model, prompt, open);
      const pickedAt = new Date().toISOString();
      writeJson(file, {
        id: model.id, label: model.label, provider: model.provider, model: model.model,
        modelReported: res.modelReported, season, week, pickedAt, promptSha256,
        attempts: res.attempts, usage: res.usage, picks: res.picks,
      });
      lock.files[name] = { sha256: fileSha(file), lockedAt: pickedAt };
      writeJson(lockFile, lock);
      console.log(`locked ${res.picks.length} picks in ${Math.round((Date.now() - started) / 1000)}s${res.attempts > 1 ? ` (${res.attempts} attempts)` : ''}`);
    } catch (err) {
      failed++;
      console.log(`FAILED: ${err.message}`);
    }
  }
  buildSite(season);
  if (failed) process.exitCode = 1;
}

// Pre-game snapshot of the spread. Games that have started keep their last snapshot.
async function cmdLines(opts) {
  const { season, week } = await resolveWeek(opts);
  const dir = weekDir(season, week);
  const raw = await fetchWeek(season, week);
  const status = Object.fromEntries(normalizeGames(raw).map((g) => [g.key, g.status]));
  const file = path.join(dir, 'lines.json');
  const snap = readJson(file, { season, week, games: {} });
  const fetchedAt = new Date().toISOString();
  let n = 0;
  for (const [key, line] of Object.entries(linesFromScoreboard(raw))) {
    if (status[key] !== 'scheduled') continue;
    snap.games[key] = { ...line, fetchedAt };
    n++;
  }
  writeJson(file, snap);
  buildSite(season);
  console.log(`week ${week}: ${n} line(s) snapshotted`);
}

async function cmdGrade(opts) {
  const { season, week } = await resolveWeek(opts);
  const dir = weekDir(season, week);
  if (!fs.existsSync(path.join(dir, 'slate.json'))) throw new Error(`week ${week}: no slate, nothing to grade`);
  const snap = readJson(path.join(dir, 'lines.json'), { games: {} });
  const file = path.join(dir, 'results.json');
  const prev = readJson(file, { games: {} });
  const results = { season, week, gradedAt: new Date().toISOString(), games: {} };
  let finals = 0;
  for (const g of normalizeGames(await fetchWeek(season, week))) {
    const entry = { status: g.status, awayScore: g.awayScore, homeScore: g.homeScore, line: null };
    if (g.status === 'final') {
      finals++;
      const had = prev.games[g.key] && prev.games[g.key].line;
      let closing = had && had.source === 'closing' ? had : null;
      if (!closing) {
        const line = await fetchClosingLine(g).catch(() => null);
        if (line) closing = { ...line, source: 'closing' };
      }
      entry.line = closing || (snap.games[g.key] ? { ...snap.games[g.key], source: 'snapshot' } : null);
      if (!entry.line) console.log(`${g.key}: no line available, graded straight-up only`);
    }
    results.games[g.key] = entry;
  }
  writeJson(file, results);
  const data = buildSite(season);
  const wk = data.weeks.find((w) => w.week === week);
  console.log(`week ${week}: ${finals} final(s) graded`);
  for (const c of data.contestants) {
    const t = wk.totals[c.id];
    if (t) console.log(`  ${c.label.padEnd(20)} SU ${t.su[0]}-${t.su[1]}  ATS ${t.atsN ? `${t.ats[0]}-${t.ats[1]}-${t.ats[2]}` : 'n/a'}`);
  }
  for (const [id, e] of Object.entries(wk.entries)) if (!e.intact) console.log(`  WARNING ${id}: pick file does not match its lock hash`);
}

async function cmdStatus(opts) {
  const { season, week } = await resolveWeek(opts);
  const dir = weekDir(season, week);
  const slate = readJson(path.join(dir, 'slate.json'));
  console.log(`season ${season} week ${week}: ${slate ? `${slate.games.length} games on the slate` : 'no slate yet'}`);
  for (const m of loadModels()) {
    const entry = readJson(path.join(picksDir(dir), `${m.id}.json`));
    console.log(`  ${m.id.padEnd(8)} ${entry ? `locked ${entry.pickedAt} (${entry.picks.length} picks)` : providerProblem(m) || 'not picked yet'}`);
  }
}

function cmdServe(opts) {
  const port = Number(opts.port || 8490);
  const types = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
  http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(SITE, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  }).listen(port, () => console.log(`http://localhost:${port}`));
}

const commands = {
  slate: cmdSlate,
  pick: cmdPick,
  lines: cmdLines,
  grade: cmdGrade,
  status: cmdStatus,
  serve: cmdServe,
  build: async (opts) => { const { season } = await resolveWeek(opts); buildSite(season); console.log('docs/data.json rebuilt'); },
};

const cmd = commands[process.argv[2]];
if (!cmd) {
  console.log('usage: node src/cli.js <slate|pick|lines|grade|build|status|serve> [--season Y] [--week N] [--model id,id] [--port N]');
  process.exitCode = 1;
} else {
  try {
    await cmd(parseArgs(process.argv.slice(3)));
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exitCode = 1;
  }
}
