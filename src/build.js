// Rolls every week on disk into docs/data.json for the static site.

import fs from 'node:fs';
import path from 'node:path';
import { BASELINES, addGrade, baselinePick, emptyTotals, gradePick, mergeTotals } from './grade.js';
import { SITE, fileSha, listWeeks, loadModels, readJson, weekDir, writeJson } from './store.js';

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

export function buildWeek(season, week) {
  const dir = weekDir(season, week);
  const slate = readJson(path.join(dir, 'slate.json'));
  if (!slate) return null;
  const picks = loadPicks(dir);
  const results = readJson(path.join(dir, 'results.json'), { games: {} });
  const snapshot = readJson(path.join(dir, 'lines.json'), { games: {} });
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
      line: line ? { homeLine: line.homeLine, total: line.total ?? null, homeMoneyline: line.homeMoneyline ?? null, awayMoneyline: line.awayMoneyline ?? null, details: line.details, provider: line.provider, closing: !!(res && res.line) } : null,
      // What the models were shown about each team.
      teams: { away: slate.teams[g.away], home: slate.teams[g.home] },
      picks: {},
    };

    for (const [id, entry] of Object.entries(picks)) {
      const pick = entry.picks.find((p) => p.game === g.key);
      // Only picks made before kickoff count.
      if (!pick || Date.parse(entry.pickedAt) >= Date.parse(g.kickoff)) continue;
      const cell = { away_score: pick.away_score, home_score: pick.home_score, winner: pick.winner, confidence: pick.confidence, reason: pick.reason, factors: pick.factors };
      if (final) {
        cell.grade = gradePick(pick, final, line);
        addGrade(total(id), cell.grade);
      }
      row.picks[id] = cell;
    }

    for (const b of BASELINES) {
      const base = baselinePick(b.id, line);
      if (!base) continue;
      const cell = { ...base.pick, winner: base.pick.home_score > base.pick.away_score ? g.home : g.away };
      if (final) {
        cell.grade = gradePick(base.pick, final, line, { ats: base.ats, ou: false });
        addGrade(total(b.id), cell.grade);
      }
      row.picks[b.id] = cell;
    }
    return row;
  });

  const entries = Object.fromEntries(Object.values(picks).map((e) => [e.id, {
    pickedAt: e.pickedAt, model: e.model, modelReported: e.modelReported, promptSha256: e.promptSha256, sha256: e.sha256, intact: e.intact,
  }]));
  return { week, games, totals, entries };
}

export function buildSite(season) {
  const weeks = listWeeks(season).map((w) => buildWeek(season, w)).filter(Boolean);
  const seasonTotals = {};
  for (const w of weeks) {
    for (const [id, t] of Object.entries(w.totals)) seasonTotals[id] = mergeTotals(seasonTotals[id] || emptyTotals(), t);
  }
  const seen = new Set(weeks.flatMap((w) => Object.keys(w.entries)));
  const models = loadModels()
    .filter((m) => seen.has(m.id))
    .map((m) => ({ id: m.id, label: m.label, kind: m.provider === 'ollama' ? 'local' : 'model', model: m.model }));
  const data = {
    season,
    generatedAt: new Date().toISOString(),
    contestants: [...models, ...BASELINES.map((b) => ({ ...b, kind: 'baseline' }))],
    totals: seasonTotals,
    weeks,
  };
  writeJson(path.join(SITE, 'data.json'), data);
  return data;
}
