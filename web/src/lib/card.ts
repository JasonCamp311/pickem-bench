// Shapes of docs/data.json (written by src/build.js) and the small bits of
// football arithmetic the page needs.

export interface Grade {
  su: 'W' | 'L' | 'T'
  ats: 'W' | 'L' | 'P' | null
  exact: boolean
}

export interface Pick {
  away_score: number
  home_score: number
  winner: string
  confidence: number
  reason?: string
  grade?: Grade
}

export interface Line {
  homeLine: number
  closing: boolean
}

export interface Game {
  key: string
  away: string
  home: string
  kickoff: string
  status: string
  awayScore: number | null
  homeScore: number | null
  line: Line | null
  picks: Record<string, Pick>
}

export interface Totals {
  n: number
  su: number[]
  ats: number[]
  atsN: number
  exact: number
  teamHits: number
  brierSum: number
  marginErrorSum: number
}

export interface Week {
  week: number
  games: Game[]
  totals: Record<string, Totals>
}

export interface Contestant {
  id: string
  label: string
  kind: 'model' | 'local' | 'baseline'
}

export interface Data {
  season: number
  generatedAt: string
  contestants: Contestant[]
  totals: Record<string, Totals>
  weeks: Week[]
}

export const kindNote: Partial<Record<Contestant['kind'], string>> = {
  local: 'runs on a home server',
  baseline: 'baseline',
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
export function headlines(data: Data, week: Week): string[] {
  const models = data.contestants.filter((c) => c.kind !== 'baseline')
  const out: string[] = []

  const graded = models.filter((c) => week.totals[c.id])
  for (const c of graded) {
    const t = week.totals[c.id]
    out.push(`${c.label} went ${t.su[0]}-${t.su[1]} straight up${t.atsN ? ` and ${t.ats[0]}-${t.ats[1]} against the spread` : ''}`)
  }

  let boldest: { text: string; confidence: number } | null = null
  for (const g of week.games) {
    if (g.status === 'final') continue
    const fav = favorite(g)
    const entries = models.filter((c) => g.picks[c.id]).map((c) => ({ c, p: g.picks[c.id] }))
    for (const { c, p } of entries) {
      if (!boldest || p.confidence > boldest.confidence) {
        const loser = p.winner === g.home ? g.away : g.home
        boldest = { confidence: p.confidence, text: `${c.label} is ${Math.round(p.confidence * 100)}% sure of ${p.winner} over ${loser}` }
      }
    }
    if (!fav || entries.length < 2) continue
    const dog = fav === g.home ? g.away : g.home
    const onDog = entries.filter((e) => e.p.winner !== fav)
    const points = Math.abs(g.line!.homeLine)
    if (onDog.length === entries.length) {
      out.push(`All ${entries.length} take ${dog} over ${fav}, a ${points}-point favorite`)
    } else if (onDog.length === 1) {
      out.push(`Only ${onDog[0].c.label} takes ${dog} over ${fav}`)
    } else if (onDog.length === entries.length - 1) {
      const loner = entries.find((e) => e.p.winner === fav)!
      out.push(`Only ${loner.c.label} sticks with ${fav} against ${dog}`)
    }
  }
  if (boldest) out.push(boldest.text)
  return out
}
