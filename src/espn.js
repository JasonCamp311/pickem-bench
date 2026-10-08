// ESPN public scoreboard: schedule, final scores and (separately) betting lines.
// Lines are only ever read by the `lines` and `grade` commands, never by the slate.

const BASE = process.env.ESPN_BASE || 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

export async function getJson(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function fetchCurrent() {
  const raw = await getJson(`${BASE}/scoreboard`);
  return { season: raw.season.year, week: raw.week.number, seasonType: raw.season.type };
}

export function fetchWeek(season, week) {
  return getJson(`${BASE}/scoreboard?seasontype=2&week=${week}&dates=${season}`);
}

function gameStatus(type) {
  if (type.state === 'post' || /FINAL/.test(type.name)) return type.completed === false ? 'off' : 'final';
  if (type.state === 'in') return 'live';
  if (/POSTPONED|CANCELED/.test(type.name)) return 'off';
  return 'scheduled';
}

export function normalizeGames(raw) {
  return (raw.events || []).map((e) => {
    const c = e.competitions[0];
    const side = (ha) => c.competitors.find((x) => x.homeAway === ha);
    const away = side('away');
    const home = side('home');
    const status = gameStatus(c.status.type);
    const played = status === 'final' || status === 'live';
    // Halftime score = first two quarters of the line score.
    const half = (side) => (status === 'final' && Array.isArray(side.linescores) && side.linescores.length >= 2
      ? Number(side.linescores[0].value) + Number(side.linescores[1].value)
      : null);
    return {
      id: e.id,
      key: `${away.team.abbreviation}@${home.team.abbreviation}`,
      kickoff: new Date(e.date).toISOString(),
      away: away.team.abbreviation,
      home: home.team.abbreviation,
      awayName: away.team.displayName,
      homeName: home.team.displayName,
      neutral: !!c.neutralSite,
      indoor: !!(c.venue && c.venue.indoor),
      status,
      awayScore: played ? Number(away.score) : null,
      homeScore: played ? Number(home.score) : null,
      awayHalf: half(away),
      homeHalf: half(home),
    };
  });
}

// Normalizes an ESPN odds entry to the home team's line (negative = home favored).
// `details` ("DAL -8.5") names the favorite, so it is unambiguous; the numeric
// `spread` field is the fallback.
export function parseLine(odds, home, away) {
  if (!odds) return null;
  let homeLine = null;
  const details = String(odds.details || '').trim();
  const m = details.match(/^([A-Z]{2,4})\s+([+-]?\d+(?:\.\d+)?)$/);
  if (m && (m[1] === home || m[1] === away)) {
    const n = Math.abs(Number(m[2]));
    homeLine = m[1] === home ? -n : n;
  } else if (/^(EVEN|PK|PICK)/i.test(details)) {
    homeLine = 0;
  } else if (Number.isFinite(Number(odds.spread)) && odds.spread !== null && odds.spread !== '') {
    homeLine = Number(odds.spread);
  }
  if (homeLine === null) return null;
  if (homeLine === 0) homeLine = 0; // no -0
  // Moneylines sit in different places on the scoreboard and the game summary.
  const moneyline = (side) => {
    const raw = odds.moneyline?.[side]?.close?.odds ?? odds[`${side}TeamOdds`]?.moneyLine;
    const n = Number(raw);
    return raw !== undefined && raw !== null && raw !== '' && Number.isFinite(n) && n !== 0 ? n : null;
  };
  return {
    homeLine,
    homeMoneyline: moneyline('home'),
    awayMoneyline: moneyline('away'),
    total: Number.isFinite(Number(odds.overUnder)) ? Number(odds.overUnder) : null,
    details: details || null,
    provider: (odds.provider && (odds.provider.displayName || odds.provider.name)) || null,
  };
}

export function linesFromScoreboard(raw) {
  const out = {};
  for (const e of raw.events || []) {
    const c = e.competitions[0];
    const ab = (ha) => c.competitors.find((x) => x.homeAway === ha).team.abbreviation;
    const line = parseLine((c.odds || [])[0], ab('home'), ab('away'));
    if (line) out[`${ab('away')}@${ab('home')}`] = line;
  }
  return out;
}

// After a game ends the scoreboard drops its odds, but the game summary keeps
// the closing line.
export async function fetchClosingLine(game) {
  const raw = await getJson(`${BASE}/summary?event=${game.id}`);
  return parseLine((raw.pickcenter || [])[0], game.home, game.away);
}

// The injury report for both teams in a game: name, position and status only.
// The same response carries odds and ESPN's own projections; none of it is read.
export async function fetchInjuries(game) {
  const raw = await getJson(`${BASE}/summary?event=${game.id}`);
  const out = {};
  for (const t of raw.injuries || []) {
    const abbr = t.team && t.team.abbreviation;
    if (!abbr) continue;
    out[abbr] = (t.injuries || [])
      .map((i) => ({
        name: String((i.athlete && i.athlete.displayName) || '').slice(0, 40),
        pos: String((i.athlete && i.athlete.position && i.athlete.position.abbreviation) || '').slice(0, 4),
        status: String(i.status || '').slice(0, 20),
      }))
      .filter((i) => i.name && i.status);
  }
  return out;
}
