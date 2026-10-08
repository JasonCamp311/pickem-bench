// Downloads the final scores of completed regular seasons into data/history/.
// Track 2's ratings start from these; the files are committed so a weekly run
// never depends on ESPN still serving old seasons.
//
//   node tools/history.js 2020 2021 2022 2023 2024 2025

import path from 'node:path';
import { fetchWeek, normalizeGames } from '../src/espn.js';
import { HISTORY, writeJson } from '../src/store.js';

const seasons = process.argv.slice(2).map(Number).filter(Boolean);
if (!seasons.length) {
  console.error('usage: node tools/history.js <season> [season ...]');
  process.exit(1);
}

for (const season of seasons) {
  const games = [];
  for (let week = 1; week <= 18; week++) {
    for (const g of normalizeGames(await fetchWeek(season, week))) {
      if (g.status !== 'final') continue;
      games.push({ week, kickoff: g.kickoff, away: g.away, home: g.home, awayScore: g.awayScore, homeScore: g.homeScore, neutral: g.neutral });
    }
  }
  games.sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.home.localeCompare(b.home));
  writeJson(path.join(HISTORY, `${season}.json`), { season, games });
  console.log(`${season}: ${games.length} games`);
}
