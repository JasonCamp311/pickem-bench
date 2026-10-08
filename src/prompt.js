// The one prompt every contestant gets, and the validator for what comes back.
// Built only from the slate (schedule + dossiers); it never sees a betting line.

const SYSTEM = `You are a contestant in an NFL pick'em benchmark. Several AI models receive this exact prompt and are graded on the same games.

For every game listed, predict the final score. You are graded on:
- straight-up winner
- your predicted margin against the closing point spread (you are not shown the spread)
- exact scores
- calibration of your confidence

Rules:
- Use the team data provided plus your own football knowledge of these teams, rosters and coaches.
- You have no betting lines. Do not guess at, reference, or anchor to point spreads or odds.
- No ties: the two scores in a game must differ.
- "confidence" is the probability (0.50 to 0.99) that the team you have winning actually wins. Be honest: a toss-up is 0.50-0.55.
- "reason" is one short sentence.
- "factors" lists the two or three things that decided the pick, most important first, each under ten words.

Reply with JSON only, no prose and no code fence, in exactly this shape:
{"picks":[{"game":"AWAY@HOME","away_score":20,"home_score":24,"confidence":0.62,"reason":"...","factors":["...","..."]}]}
Include every game exactly once, using the game ids exactly as given.`;

function teamBlock(t, role) {
  const head = `  ${t.abbr} (${role}): ${t.record}, home ${t.homeRecord}, road ${t.roadRecord}` +
    (t.pointsFor !== null ? `, ${t.pointsFor} pts/g for, ${t.pointsAgainst} against` : '') +
    (t.streak ? `, streak ${t.streak}` : '') +
    (t.restDays !== null ? `, ${t.restDays} days rest` : '');
  return `${head}\n    ${t.results.length ? t.results.join('; ') : 'no games played yet'}`;
}

export function buildPrompt(slate, games = slate.games) {
  const blocks = games.map((g) => {
    const site = g.neutral ? 'neutral site' : `at ${g.home}`;
    return [
      `GAME ${g.key} | ${g.awayName} at ${g.homeName} | kickoff ${g.kickoff} | ${site}${g.indoor ? ', indoors' : ''}`,
      teamBlock(slate.teams[g.away], 'away'),
      teamBlock(slate.teams[g.home], g.neutral ? 'designated home' : 'home'),
    ].join('\n');
  });
  const user = `NFL ${slate.season} regular season, week ${slate.week}. ${games.length} games.\n\n${blocks.join('\n\n')}`;
  return { system: SYSTEM, user };
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object found in reply');
  return JSON.parse(text.slice(start, end + 1));
}

// Returns validated picks in slate order, or throws with every problem listed
// so the retry can tell the model what to fix.
export function parsePicks(text, games) {
  let body;
  try {
    body = extractJson(String(text));
  } catch (err) {
    throw new Error(`reply was not valid JSON (${err.message})`);
  }
  const list = Array.isArray(body) ? body : body.picks;
  if (!Array.isArray(list)) throw new Error('reply has no "picks" array');

  const byKey = new Map();
  const problems = [];
  for (const p of list) {
    const key = String(p && p.game).toUpperCase().replace(/\s+/g, '');
    if (byKey.has(key)) problems.push(`${key}: listed more than once`);
    byKey.set(key, p);
  }
  const known = new Set(games.map((g) => g.key));
  for (const key of byKey.keys()) if (!known.has(key)) problems.push(`${key}: not a game on this slate`);

  const picks = [];
  for (const g of games) {
    const p = byKey.get(g.key);
    if (!p) { problems.push(`${g.key}: missing`); continue; }
    const a = Number(p.away_score);
    const h = Number(p.home_score);
    const conf = Number(p.confidence);
    if (!Number.isInteger(a) || !Number.isInteger(h) || a < 0 || h < 0 || a > 80 || h > 80) {
      problems.push(`${g.key}: scores must be whole numbers from 0 to 80`);
      continue;
    }
    if (a === h) { problems.push(`${g.key}: scores are tied`); continue; }
    if (!Number.isFinite(conf) || conf < 0.5 || conf > 1) {
      problems.push(`${g.key}: confidence must be between 0.50 and 0.99`);
      continue;
    }
    picks.push({
      game: g.key,
      away_score: a,
      home_score: h,
      winner: h > a ? g.home : g.away,
      confidence: Math.min(conf, 0.99),
      reason: String(p.reason || '').slice(0, 300),
      // Optional: picks locked before this field existed do not have it.
      factors: Array.isArray(p.factors) ? p.factors.slice(0, 3).map((f) => String(f).slice(0, 120)) : [],
    });
  }
  if (problems.length) throw new Error(problems.join('; '));
  return picks;
}
