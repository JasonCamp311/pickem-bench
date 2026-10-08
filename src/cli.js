#!/usr/bin/env node
// pickem-bench: slate -> pick -> lines -> grade -> build.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fetchClosingLine, fetchCurrent, fetchWeek, linesFromScoreboard, normalizeGames } from './espn.js';
import { buildDossiers } from './features.js';
import { buildPrompt } from './prompt.js';
import { complete, providerProblem, runModel } from './providers.js';
import { buildSite } from './build.js';
import { PRIVATE, SITE, fileSha, loadModels, readJson, sha256, weekDir, writeJson } from './store.js';

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
    games: games.map(({ status, awayScore, homeScore, awayHalf, homeHalf, ...g }) => g).sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.key.localeCompare(b.key)),
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
        attempts: res.attempts, usage: res.usage, lock: res.lock, upset: res.upset, picks: res.picks,
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
    const entry = { status: g.status, awayScore: g.awayScore, homeScore: g.homeScore, awayHalf: g.awayHalf, homeHalf: g.homeHalf, line: null };
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
    if (t) console.log(`  ${c.label.padEnd(20)} SU ${t.su[0]}-${t.su[1]}  ATS ${t.atsN ? `${t.ats[0]}-${t.ats[1]}-${t.ats[2]}` : 'n/a'}  O/U ${t.ouN ? `${t.ou[0]}-${t.ou[1]}-${t.ou[2]}` : 'n/a'}`);
  }
  for (const [id, e] of Object.entries(wk.entries)) if (!e.intact) console.log(`  WARNING ${id}: pick file does not match its lock hash`);
}

// Asks one model to flag reasons that contradict the data the pickers were shown.
// It is a second opinion, not ground truth: the site labels flags as automatic.
async function cmdCheck(opts) {
  const { season, week } = await resolveWeek(opts);
  const dir = weekDir(season, week);
  const slate = readJson(path.join(dir, 'slate.json'));
  if (!slate || !hasPicks(dir)) throw new Error(`week ${week}: no picks to check`);
  const checker = { provider: 'openrouter', model: String(opts.checker || process.env.PICKEM_CHECKER || 'anthropic/claude-sonnet-5.5') };
  const problem = providerProblem(checker);
  if (problem) throw new Error(problem);

  const entries = fs.readdirSync(picksDir(dir)).map((name) => readJson(path.join(picksDir(dir), name)));
  const reasons = slate.games.map((g) => {
    const lines = entries.map((e) => {
      const p = e.picks.find((x) => x.game === g.key);
      return p && p.reason ? `  ${e.id} (picked ${p.winner}): ${p.reason}` : null;
    }).filter(Boolean);
    return `REASONS FOR ${g.key}\n${lines.join('\n')}`;
  }).join('\n\n');
  const system = `You check sports-prediction reasons against a data sheet. Each reason was written by a model that was shown ONLY the data sheet below.
Flag a reason only when it states something the data sheet directly contradicts, for example calling a team bad at home when its home record is 2-0.
Do not flag opinions, predictions, vague praise, or claims about things the sheet does not cover (players, coaches, injuries).
Reply with JSON only: {"flags":[{"game":"AWAY@HOME","model":"id","claim":"the contradicted statement, quoted or closely paraphrased","evidence":"what the sheet shows instead"}]}
An empty list is a fine answer.`;
  const reply = await complete(checker, [
    { role: 'system', content: system },
    { role: 'user', content: `DATA SHEET\n${buildPrompt(slate).user}\n\n${reasons}` },
  ]);
  const text = reply.text;
  const body = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const games = new Set(slate.games.map((g) => g.key));
  const ids = new Set(entries.map((e) => e.id));
  const flags = (Array.isArray(body.flags) ? body.flags : [])
    .filter((f) => f && games.has(f.game) && ids.has(f.model) && f.claim && f.evidence)
    .map((f) => ({ game: f.game, model: f.model, claim: String(f.claim).slice(0, 300), evidence: String(f.evidence).slice(0, 300) }));
  writeJson(path.join(dir, 'checks.json'), { season, week, checkedAt: new Date().toISOString(), checker: checker.model, flags });
  buildSite(season);
  console.log(`week ${week}: ${flags.length} reason(s) flagged by ${checker.model}`);
  for (const f of flags) console.log(`  ${f.game} ${f.model}: ${f.claim} -> ${f.evidence}`);
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

// Serves docs/ and, to this machine only, the private bet log in private/bets.json.
// private/ is git-ignored, so the log is never part of the published site.
function cmdServe(opts) {
  const port = Number(opts.port || 8490);
  const types = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
  const betsFile = path.join(PRIVATE, 'bets.json');
  const local = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (rel === '/private/bets.json') {
      if (!local(req)) { res.writeHead(403).end('private'); return; }
      if (req.method === 'PUT') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; if (body.length > 1e6) req.destroy(); });
        req.on('end', () => {
          try {
            const bets = JSON.parse(body);
            if (!Array.isArray(bets)) throw new Error('expected a list');
            writeJson(betsFile, bets);
            res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
          } catch (err) {
            res.writeHead(400).end(err.message);
          }
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(readJson(betsFile, [])));
      return;
    }
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
  check: cmdCheck,
  serve: cmdServe,
  build: async (opts) => { const { season } = await resolveWeek(opts); buildSite(season); console.log('docs/data.json rebuilt'); },
};

const cmd = commands[process.argv[2]];
if (!cmd) {
  console.log('usage: node src/cli.js <slate|pick|check|lines|grade|build|status|serve> [--season Y] [--week N] [--model id,id] [--port N]');
  process.exitCode = 1;
} else {
  try {
    await cmd(parseArgs(process.argv.slice(3)));
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exitCode = 1;
  }
}
