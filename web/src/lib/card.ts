// Shapes of docs/data.json (written by src/build.js) and the small bits of
// football arithmetic the page needs.

export interface Grade {
  brier: number
  marginError: number
  su: 'W' | 'L' | 'T'
  ats: 'W' | 'L' | 'P' | null
  ou: 'W' | 'L' | 'P' | null
  fh?: 'W' | 'L' | 'P' | null
  exact: boolean
}

export interface Pick {
  away_score: number
  home_score: number
  winner: string
  confidence: number
  reason?: string
  factors?: string[]
  first_half?: string | null
  flags?: { claim: string; evidence: string }[]
  grade?: Grade
}

// Track 2's sheet for one team: code ratings, last season and the injury report.
export interface DossierV2 {
  abbr: string
  record: string
  pointsFor: number | null
  pointsAgainst: number | null
  results: string[]
  lastSeason: { record: string; pointsFor: number; pointsAgainst: number } | null
  rating: { power: number; offense: number; defense: number; rank: number | null; of: number }
  injuries: { name: string; pos: string; status: string }[]
}

// The score the ratings imply for one game.
export interface MathLine {
  margin: number
  total: number
  homePoints: number
  awayPoints: number
  homeWin: number
}

export interface Line {
  homeLine: number
  total: number | null
  homeMoneyline: number | null
  awayMoneyline: number | null
  closing: boolean
}

export interface Dossier {
  abbr: string
  record: string
  homeRecord: string
  roadRecord: string
  pointsFor: number | null
  pointsAgainst: number | null
  streak: string | null
  restDays: number | null
  results: string[]
}

export interface Game {
  key: string
  away: string
  home: string
  kickoff: string
  neutral: boolean
  teams: { away: Dossier; home: Dossier }
  status: string
  awayScore: number | null
  homeScore: number | null
  line: Line | null
  picks: Record<string, Pick>
  v2?: { away: DossierV2; home: DossierV2; math: MathLine }
}

export interface Totals {
  n: number
  su: number[]
  ats: number[]
  atsN: number
  ou: number[]
  ouN: number
  fh: number[]
  lock: number[]
  upset: number[]
  exact: number
  teamHits: number
  brierSum: number
  marginErrorSum: number
}

export interface Call {
  game: string
  winner: string
  result: 'W' | 'L' | null
}

export interface Week {
  week: number
  games: Game[]
  totals: Record<string, Totals>
  entries: Record<string, { lock: Call | null; upset: Call | null }>
  checker: string | null
  // Track 3: the scorecard each model was shown this week, as it read it.
  cards?: Record<string, { games: number; text: string }>
}

export interface Contestant {
  id: string
  label: string
  kind: 'model' | 'local' | 'consensus' | 'math' | 'baseline'
  // Baselines have no track: they sit beside both.
  track?: Track
}

// v1 is the original scores-only prompt; v2 adds code ratings and injuries;
// v3 is v2 plus each model's own scorecard.
export type Track = 'v1' | 'v2' | 'v3'
export const TRACKS: { id: Track; label: string; blurb: string }[] = [
  { id: 'v1', label: 'Scores only', blurb: 'The original prompt: records and final scores, nothing else.' },
  { id: 'v2', label: 'Ratings and injuries', blurb: 'The same models, given team ratings computed by code and the injury report.' },
  { id: 'v3', label: 'With feedback', blurb: 'The ratings track again, with each model also shown how its own earlier picks were graded.' },
]

// One track's view of the data: its contestants plus the baselines.
export const onTrack = (data: Data, track: Track): Data => ({ ...data, contestants: data.contestants.filter((c) => !c.track || c.track === track) })
export const hasTrack = (data: Data, track: Track) => data.contestants.some((c) => c.track === track)

// Contestants that are arithmetic rather than a model's own pick.
export const derived = (c: Contestant) => c.kind === 'consensus' || c.kind === 'math'

export interface Data {
  season: number
  generatedAt: string
  contestants: Contestant[]
  totals: Record<string, Totals>
  weeks: Week[]
  method: { system: string; sample: string } | null
  methodV2?: { system: string; sample: string; params?: { elo: Record<string, number>; ridge: Record<string, number>; sigma: number } } | null
  methodV3?: Data['methodV2']
}

export const kindNote: Partial<Record<Contestant['kind'], string>> = {
  local: 'runs on a home server',
  baseline: 'baseline',
  consensus: 'average of the models',
  math: 'code ratings, no model',
}

export const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n)

export const kick = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })

export const pct = (w: number, l: number) => (w + l ? `${Math.round((w / (w + l)) * 100)}%` : '')

export function favorite(g: Game): string | null {
  if (!g.line || g.line.homeLine === 0) return null
  return g.line.homeLine < 0 ? g.home : g.away
}

export function lineText(g: Game): string {
  if (!g.line) return 'No line yet'
  const fav = favorite(g)
  return fav ? `${fav} ${signed(-Math.abs(g.line.homeLine))}` : "Pick'em"
}

// Which side of the spread a predicted score lands on.
export function takes(g: Game, p: Pick): string | null {
  if (!g.line) return null
  const edge = p.home_score - p.away_score + g.line.homeLine
  if (edge === 0) return null
  return edge > 0 ? `${g.home} ${signed(g.line.homeLine)}` : `${g.away} ${signed(-g.line.homeLine)}`
}

// Headlines for the ticker: where the models gang up on the favorite, where
// one of them stands alone, and the single most confident call.
// One talking point for the ticker. `game` is the game it is about, when there
// is one, so the ticker can open that game's breakdown.
export interface Headline {
  text: string
  game?: string
}

export function headlines(data: Data, week: Week): Headline[] {
  const models = modelsOf(data)
  const out: Headline[] = []

  const graded = models.filter((c) => week.totals[c.id])
  for (const c of graded) {
    const t = week.totals[c.id]
    out.push({ text: `${c.label} went ${t.su[0]}-${t.su[1]} straight up${t.atsN ? ` and ${t.ats[0]}-${t.ats[1]} against the spread` : ''}` })
  }

  let boldest: (Headline & { confidence: number }) | null = null
  for (const g of week.games) {
    if (g.status === 'final') continue
    const fav = favorite(g)
    const entries = models.filter((c) => g.picks[c.id]).map((c) => ({ c, p: g.picks[c.id] }))
    for (const { c, p } of entries) {
      if (!boldest || p.confidence > boldest.confidence) {
        const loser = p.winner === g.home ? g.away : g.home
        boldest = { confidence: p.confidence, game: g.key, text: `${c.label} is ${Math.round(p.confidence * 100)}% sure of ${p.winner} over ${loser}` }
      }
    }
    if (!fav || entries.length < 2) continue
    const dog = fav === g.home ? g.away : g.home
    const onDog = entries.filter((e) => e.p.winner !== fav)
    const points = Math.abs(g.line!.homeLine)
    if (onDog.length === entries.length) {
      out.push({ game: g.key, text: `All ${entries.length} take ${dog} over ${fav}, a ${points}-point favorite` })
    } else if (onDog.length === 1) {
      out.push({ game: g.key, text: `Only ${onDog[0].c.label} takes ${dog} over ${fav}` })
    } else if (onDog.length === entries.length - 1) {
      const loner = entries.find((e) => e.p.winner === fav)!
      out.push({ game: g.key, text: `Only ${loner.c.label} sticks with ${fav} against ${dog}` })
    }
  }
  if (boldest) out.push({ text: boldest.text, game: boldest.game })
  return out
}

export const modelsOf = (data: Data) => data.contestants.filter((c) => c.kind === 'model' || c.kind === 'local')

// Two-letter tag for chart marks: GP, CL, GE, GR, LL, QW.
export const code = (c: Contestant) => c.label.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()

export const margin = (p: Pick) => p.home_score - p.away_score

// Over or under the posted total, from the predicted score.
export function totalLean(g: Game, p: Pick): string | null {
  if (!g.line || g.line.total === null) return null
  const sum = p.home_score + p.away_score
  if (sum === g.line.total) return null
  return `${sum > g.line.total ? 'over' : 'under'} ${g.line.total}`
}

export interface Profile {
  games: number
  upsets: number
  home: number
  confidence: number
  points: number
  overs: number
  unders: number
  winBy: number
  favSides: number
  dogSides: number
  alone: number
  boldest: string
}

// How one model filled out this week's card.
export function profile(week: Week, c: Contestant, models: Contestant[]): Profile {
  const out: Profile = { games: 0, upsets: 0, home: 0, confidence: 0, points: 0, overs: 0, unders: 0, winBy: 0, favSides: 0, dogSides: 0, alone: 0, boldest: '' }
  let top = 0
  for (const g of week.games) {
    const p = g.picks[c.id]
    if (!p) continue
    out.games++
    const fav = favorite(g)
    const m = margin(p)
    if (fav && p.winner !== fav) out.upsets++
    if (p.winner === g.home) out.home++
    out.confidence += p.confidence
    out.points += p.home_score + p.away_score
    out.winBy += Math.abs(m)
    if (g.line) {
      const edge = m + g.line.homeLine
      if (fav && edge !== 0) (edge > 0 ? g.home : g.away) === fav ? out.favSides++ : out.dogSides++
      if (g.line.total !== null) {
        const sum = p.home_score + p.away_score
        if (sum > g.line.total) out.overs++
        if (sum < g.line.total) out.unders++
      }
    }
    const others = models.filter((o) => o.id !== c.id && g.picks[o.id])
    if (others.length && others.every((o) => g.picks[o.id].winner !== p.winner)) out.alone++
    if (p.confidence > top) {
      top = p.confidence
      out.boldest = `${p.winner} over ${p.winner === g.home ? g.away : g.home}, ${Math.round(p.confidence * 100)}%`
    }
  }
  if (out.games) {
    out.confidence /= out.games
    out.points /= out.games
    out.winBy /= out.games
  }
  return out
}

// agree[i][j] = games where models i and j picked the same winner.
export function agreement(week: Week, models: Contestant[]) {
  const agree = models.map(() => models.map(() => 0))
  let games = 0
  for (const g of week.games) {
    if (!models.every((c) => g.picks[c.id])) continue
    games++
    models.forEach((a, i) => models.forEach((b, j) => {
      if (g.picks[a.id].winner === g.picks[b.id].winner) agree[i][j]++
    }))
  }
  return { agree, games }
}

export const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })

export const kickTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
