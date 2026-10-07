import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = process.env.PICKEM_DATA || path.join(ROOT, 'data');
export const SITE = process.env.PICKEM_SITE || path.join(ROOT, 'docs');

export const weekDir = (season, week) => path.join(DATA, String(season), `week-${String(week).padStart(2, '0')}`);

export function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

export const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
export const fileSha = (file) => sha256(fs.readFileSync(file));

export function listWeeks(season) {
  const dir = path.join(DATA, String(season));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map((name) => /^week-(\d+)$/.exec(name))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

export function loadModels() {
  return readJson(path.join(ROOT, 'models.json'), []);
}
