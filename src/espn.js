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
  return {
    homeLine,
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
