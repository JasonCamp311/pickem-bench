// Rolls every week on disk into docs/data.json for the static site.

import fs from 'node:fs';
import path from 'node:path';
import { BASELINES, addGrade, baselinePick, emptyTotals, gradeFirstHalf, gradePick, mergeTotals } from './grade.js';
import { buildPrompt } from './prompt.js';
import { SITE, fileSha, listWeeks, loadModels, readJson, weekDir, writeJson } from './store.js';

// The average of the models' predicted scores, graded as one more contestant.
// Each track has its own, built only from that track's models.
export const CONSENSUS = { id: 'consensus', label: 'Model consensus', note: "The average of the models' predicted scores." };
const TRACKS = ['v1', 'v2'];
const consensusId = (track) => (track === 'v1' ? CONSENSUS.id : `${CONSENSUS.id}-${track}`);
// Track 2's code-only contestant: a locked pick file with no model behind it.
const MATH_ID = 'math-v2';
const trackOf = (id) => (id.endsWith('-v2') ? 'v2' : 'v1');

function loadPicks(dir) {
  const picksDir = path.join(dir, 'picks');
  const lock = readJson(path.join(dir, 'lock.json'), { files: {} });
  const out = {};
  if (!fs.existsSync(picksDir)) return out;
  for (const name of fs.readdirSync(picksDir).filter((n) => n.endsWith('.json'))) {
    const file = path.join(picksDir, name);
    const entry = readJson(file);
    const locked = lock.files[name];
    entry.sha256 = fileSha(file);
    // A pick file that no longer matches its lock hash was edited after the fact.
    entry.intact = !!locked && locked.sha256 === entry.sha256;
    out[entry.id] = entry;
  }
  return out;
}

function consensusPick(cells) {
  if (cells.length < 2) return null;
  const mean = (f) => cells.reduce((sum, c) => sum + f(c), 0) / cells.length;
  const away = Math.round(mean((c) => c.away_score) * 10) / 10;
  const home = Math.round(mean((c) => c.home_score) * 10) / 10;
  if (away === home) return null;
  const pHome = mean((c) => (c.home_score > c.away_score ? c.confidence : 1 - c.confidence));
  // Scores and probabilities are averaged separately and can point opposite ways.
  const confidence = home > away ? pHome : 1 - pHome;
  return { away_score: away, home_score: home, confidence: Math.max(0.5, Math.round(confidence * 100) / 100) };
}

export function buildWeek(season, week) {
  const dir = weekDir(season, week);
  const slateV2 = readJson(path.join(dir, 'slate-v2.json'));
  const slate = readJson(path.join(dir, 'slate.json')) || slateV2;
  if (!slate) return null;
  const picks = loadPicks(dir);
  const results = readJson(path.join(dir, 'results.json'), { games: {} });
  const snapshot = readJson(path.join(dir, 'lines.json'), { games: {} });
  const checks = readJson(path.join(dir, 'checks.json'), null);
  const totals = {};
  const total = (id) => (totals[id] ??= emptyTotals());

  const games = slate.games.map((g) => {
    const res = results.games[g.key];
    const final = res && res.status === 'final' ? res : null;
    const line = (res && res.line) || snapshot.games[g.key] || null;
    const row = {
      key: g.key, away: g.away, home: g.home, kickoff: g.kickoff, neutral: g.neutral,
      status: res ? res.status : 'scheduled',
      awayScore: res ? res.awayScore : null,
      homeScore: res ? res.homeScore : null,
      awayHalf: res ? res.awayHalf ?? null : null,
      homeHalf: res ? res.homeHalf ?? null : null,
      line: line ? {
        homeLine: line.homeLine, total: line.total ?? null,
        homeMoneyline: line.homeMoneyline ?? null, awayMoneyline: line.awayMoneyline ?? null,
        details: line.details, provider: line.provider, closing: !!(res && res.line),
      } : null,
      // What the models were shown about each team.
      teams: { away: slate.teams[g.away], home: slate.teams[g.home] },
      picks: {},
    };
    // Track 2's sheet for the same game: ratings, injuries and the implied score.
    if (slateV2 && slateV2.math[g.key]) row.v2 = { away: slateV2.teams[g.away], home: slateV2.teams[g.home], math: slateV2.math[g.key] };

    const modelCells = [];
    for (const [id, entry] of Object.entries(picks)) {
      const pick = entry.picks.find((p) => p.game === g.key);
      // Only picks made before kickoff count.
      if (!pick || Date.parse(entry.pickedAt) >= Date.parse(g.kickoff)) continue;
      const cell = {
        away_score: pick.away_score, home_score: pick.home_score, winner: pick.winner, confidence: pick.confidence,
        reason: pick.reason, factors: pick.factors, first_half: pick.first_half ?? null,
      };
      const flags = checks ? checks.flags.filter((f) => f.game === g.key && f.model === id) : [];
      if (flags.length) cell.flags = flags.map((f) => ({ claim: f.claim, evidence: f.evidence }));
      if (final) {
        cell.grade = { ...gradePick(pick, final, line), fh: gradeFirstHalf(pick, g, final) };
        addGrade(total(id), cell.grade);
      }
      row.picks[id] = cell;
      if (id !== MATH_ID) modelCells.push({ ...cell, track: trackOf(id) });
    }

    const extras = [];
    for (const track of TRACKS) {
      const avg = consensusPick(modelCells.filter((c) => c.track === track));
      if (avg) extras.push({ id: consensusId(track), pick: avg, ats: true, ou: true });
    }
    for (const b of BASELINES) {
      const base = baselinePick(b.id, line);
      if (base) extras.push({ id: b.id, pick: base.pick, ats: base.ats, ou: false });
    }
    for (const x of extras) {
      const cell = { ...x.pick, winner: x.pick.home_score > x.pick.away_score ? g.home : g.away };
      if (final) {
        cell.grade = gradePick(x.pick, final, line, { ats: x.ats, ou: x.ou });
        addGrade(total(x.id), cell.grade);
      }
      row.picks[x.id] = cell;
    }
    return row;
  });

  // Each model's lock and upset of the week, graded off the same picks.
  const calls = {};
  const byKey = Object.fromEntries(games.map((g) => [g.key, g]));
  for (const [id, entry] of Object.entries(picks)) {
    const call = (key, isUpset) => {
      const row = key && byKey[key];
      const cell = row && row.picks[id];
      if (!cell) return null;
      let result = null;
      if (cell.grade && cell.grade.su !== 'T') {
        const fav = row.line && row.line.homeLine !== 0 ? (row.line.homeLine < 0 ? row.home : row.away) : null;
        // An upset call only hits if the team really was the underdog and won.
        const hit = cell.grade.su === 'W' && (!isUpset || (fav !== null && cell.winner !== fav));
        if (!isUpset || row.line) result = hit ? 'W' : 'L';
      }
      if (result) total(id)[isUpset ? 'upset' : 'lock'][result === 'W' ? 0 : 1]++;
      return { game: key, winner: cell.winner, result };
    };
    calls[id] = { lock: call(entry.lock, false), upset: call(entry.upset, true) };
  }

  const entries = Object.fromEntries(Object.values(picks).map((e) => [e.id, {
    pickedAt: e.pickedAt, model: e.model, modelReported: e.modelReported, promptSha256: e.promptSha256, sha256: e.sha256, intact: e.intact,
    lock: calls[e.id].lock, upset: calls[e.id].upset,
  }]));
  return { week, games, totals, entries, checker: checks ? checks.checker : null };
}

export function buildSite(season) {
  const weekNumbers = listWeeks(season);
  const weeks = weekNumbers.map((w) => buildWeek(season, w)).filter(Boolean);
  const seasonTotals = {};
  for (const w of weeks) {
    for (const [id, t] of Object.entries(w.totals)) seasonTotals[id] = mergeTotals(seasonTotals[id] || emptyTotals(), t);
  }
  const seen = new Set(weeks.flatMap((w) => Object.keys(w.entries)));
  const models = loadModels()
    .filter((m) => seen.has(m.id))
    .map((m) => ({ id: m.id, label: m.label, kind: m.provider === 'ollama' ? 'local' : 'model', model: m.model, track: m.track || 'v1' }));

  // The method page shows the real prompt: the rules plus one game as the models saw it.
  const sample = (name) => {
    const latest = [...weeks].reverse().map((w) => readJson(path.join(weekDir(season, w.week), name))).find((s) => s && s.games.length);
    if (!latest) return null;
    const prompt = buildPrompt(latest, latest.games.slice(0, 1));
    return { system: prompt.system, sample: prompt.user, ...(latest.params ? { params: latest.params } : {}) };
  };
  const method = sample('slate.json');
  const methodV2 = sample('slate-v2.json');
  const onTrack = (track) => models.filter((m) => m.track === track);

  const data = {
    season,
    generatedAt: new Date().toISOString(),
    // Baselines carry no track: they belong to both.
    contestants: [
      ...onTrack('v1'),
      ...(onTrack('v1').length >= 2 ? [{ ...CONSENSUS, kind: 'consensus', track: 'v1' }] : []),
      ...onTrack('v2'),
      ...(seen.has(MATH_ID) ? [{ id: MATH_ID, label: 'Ratings only', kind: 'math', track: 'v2', note: 'The code ratings with no model.' }] : []),
      ...(onTrack('v2').length >= 2 ? [{ ...CONSENSUS, id: consensusId('v2'), kind: 'consensus', track: 'v2' }] : []),
      ...BASELINES.map((b) => ({ ...b, kind: 'baseline' })),
    ],
    totals: seasonTotals,
    weeks,
    method,
    methodV2,
  };
  writeJson(path.join(SITE, 'data.json'), data);
  return data;
}
