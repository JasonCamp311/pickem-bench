// Season-long numbers: running records, a flat-bet bankroll, calibration,
// per-team views and the weekly recap.

import { favorite, kick, margin, modelsOf } from '@/lib/card'
import type { Contestant, Data, Game, Week } from '@/lib/card'

export interface Series {
  id: string
  label: string
  style: 'solid' | 'dashed' | 'dotted'
  values: number[]
}

const styleOf = (c: Contestant): Series['style'] => (c.kind === 'baseline' ? 'dashed' : c.kind === 'consensus' || c.kind === 'math' ? 'dotted' : 'solid')

// One running total per contestant, starting from zero before the first week.
function running(data: Data, perWeek: (w: Week, id: string) => number | null): Series[] {
  return data.contestants
    .filter((c) => data.weeks.some((w) => perWeek(w, c.id) !== null))
    .map((c) => {
      let sum = 0
      const values = [0, ...data.weeks.map((w) => (sum += perWeek(w, c.id) ?? 0))]
      return { id: c.id, label: c.label, style: styleOf(c), values }
    })
}

// Wins minus losses against the spread.
export const spreadRace = (data: Data) =>
  running(data, (w, id) => {
    const t = w.totals[id]
    return t && t.atsN ? t.ats[0] - t.ats[1] : null
  })

// $100 on every spread side at the standard -110 price: a win pays $90.91.
export const STAKE = 100
export const WIN_PAYS = (STAKE * 100) / 110
export const bankroll = (data: Data) =>
  running(data, (w, id) => {
    const t = w.totals[id]
    return t && t.atsN ? Math.round((t.ats[0] * WIN_PAYS - t.ats[1] * STAKE) * 100) / 100 : null
  })

export const gradedWeeks = (data: Data) => data.weeks.filter((w) => Object.values(w.totals).some((t) => t.n > 0))

export interface Bin {
  from: number
  to: number
  n: number
  wins: number
  stated: number
}

// Picks grouped by stated confidence, with how often each group actually won.
export function calibration(data: Data, id: string): Bin[] {
  const bins: Bin[] = [0.5, 0.6, 0.7, 0.8].map((from, i) => ({ from, to: i === 3 ? 1 : from + 0.1, n: 0, wins: 0, stated: 0 }))
  for (const w of data.weeks) {
    for (const g of w.games) {
      const p = g.picks[id]
      if (!p?.grade) continue
      const bin = bins[Math.min(3, Math.max(0, Math.floor((p.confidence - 0.5) * 10 + 1e-9)))]
      bin.n++
      bin.stated += p.confidence
      bin.wins += p.grade.su === 'W' ? 1 : p.grade.su === 'T' ? 0.5 : 0
    }
  }
  return bins
}

export interface TeamGame {
  week: number
  game: Game
  opponent: string
  home: boolean
  actual: number | null
  predicted: Record<string, number>
}

export const allTeams = (data: Data) => [...new Set(data.weeks.flatMap((w) => w.games.flatMap((g) => [g.away, g.home])))].sort()

// Every game a team has played, with each model's predicted margin from that team's side.
export function teamGames(data: Data, team: string): TeamGame[] {
  const models = modelsOf(data)
  return data.weeks.flatMap((w) =>
    w.games
      .filter((g) => g.away === team || g.home === team)
      .map((g) => {
        const home = g.home === team
        const flip = (m: number) => (home ? m : -m)
        const predicted: Record<string, number> = {}
        for (const c of models) if (g.picks[c.id]) predicted[c.id] = flip(margin(g.picks[c.id]))
        const done = g.status === 'final' && g.homeScore !== null && g.awayScore !== null
        return { week: w.week, game: g, opponent: home ? g.away : g.home, home, actual: done ? flip(g.homeScore! - g.awayScore!) : null, predicted }
      }),
  )
}

const rec = (r: number[]) => `${r[0]}-${r[1]}${r[2] ? `-${r[2]}` : ''}`

// A few plain sentences about the week, built from the numbers alone.
export function recap(data: Data, week: Week): string[] {
  const models = modelsOf(data).filter((c) => week.games.some((g) => g.picks[c.id]))
  const ids = models.map((c) => c.id)
  const out: string[] = []
  const finals = week.games.filter((g) => g.status === 'final')
  const pending = week.games.filter((g) => g.status !== 'final')

  if (finals.length) {
    const ranked = models
      .filter((c) => week.totals[c.id]?.n)
      .map((c) => ({ c, t: week.totals[c.id] }))
      .sort((a, b) => b.t.ats[0] - b.t.ats[1] - (a.t.ats[0] - a.t.ats[1]) || b.t.su[0] - a.t.su[0])
    if (ranked.length) {
      const top = ranked[0]
      const last = ranked[ranked.length - 1]
      out.push(`${pending.length ? 'Leading so far' : 'Winner of the week'}: ${top.c.label}, ${rec(top.t.ats)} against the spread and ${rec(top.t.su)} straight up.`)
      if (ranked.length > 1 && last.c.id !== top.c.id) out.push(`Wooden spoon: ${last.c.label}, ${rec(last.t.ats)} against the spread.`)
    }
    for (const g of finals) {
      const exact = models.filter((c) => g.picks[c.id]?.grade?.exact)
      if (exact.length) out.push(`${exact.map((c) => c.label).join(' and ')} called the exact final in ${g.away} at ${g.home}, ${g.awayScore}-${g.homeScore}.`)
    }
    const con = week.totals[data.contestants.find((c) => c.kind === 'consensus')?.id ?? 'consensus']
    const fav = week.totals['base-favorite']
    if (con?.n && fav?.n) out.push(`The model consensus went ${rec(con.su)} straight up; always taking the favorite went ${rec(fav.su)}.`)
    const locks = ids.reduce((s, id) => [s[0] + (week.totals[id]?.lock[0] ?? 0), s[1] + (week.totals[id]?.lock[1] ?? 0)], [0, 0])
    if (locks[0] + locks[1]) out.push(`Locks of the week are ${rec(locks)}.`)
  }

  if (pending.length) {
    if (!finals.length) out.push(`Picks are locked for all ${week.games.length} games. First kickoff: ${pending[0].away} at ${pending[0].home}, ${kick(pending[0].kickoff)}.`)
    const upsets = pending.filter((g) => {
      const fav = favorite(g)
      const picks = ids.filter((id) => g.picks[id]).map((id) => g.picks[id])
      return fav && picks.length && picks.filter((p) => p.winner !== fav).length * 2 > picks.length
    })
    if (upsets.length) out.push(`Most models pick against the favorite in ${upsets.length} of the ${pending.length} games still to play: ${upsets.map((g) => `${g.away} at ${g.home}`).join(', ')}.`)
    let widest: { g: Game; lo: number; hi: number } | null = null
    for (const g of pending) {
      const ms = ids.filter((id) => g.picks[id]).map((id) => margin(g.picks[id]))
      if (ms.length < 2) continue
      const lo = Math.min(...ms)
      const hi = Math.max(...ms)
      if (!widest || hi - lo > widest.hi - widest.lo) widest = { g, lo, hi }
    }
    if (widest) {
      const side = (m: number) => `${m > 0 ? widest!.g.home : widest!.g.away} by ${Math.abs(m)}`
      out.push(`Biggest split: ${widest.g.away} at ${widest.g.home}, where predictions run from ${side(widest.lo)} to ${side(widest.hi)}.`)
    }
  }
  return out
}

export interface Paired {
  id: string
  label: string
  n: number
  // Mean of (second minus first) per game, and its standard error.
  miss: { a: number; b: number; diff: number; se: number }
  brier: { a: number; b: number; diff: number; se: number }
}

// Two contestants on the same games: the per-game difference in margin miss
// and Brier score. Pairing removes the luck both share in a game, which is
// most of the noise in a win-loss record.
export function paired(data: Data, a: string, b: string, id: string, label: string): Paired | null {
  const rows: { miss: [number, number]; brier: [number, number] }[] = []
  for (const w of data.weeks) {
    for (const g of w.games) {
      const x = g.picks[a]?.grade
      const y = g.picks[b]?.grade
      if (x && y) rows.push({ miss: [x.marginError, y.marginError], brier: [x.brier, y.brier] })
    }
  }
  const n = rows.length
  if (!n) return null
  const stat = (key: 'miss' | 'brier') => {
    const mean = (i: 0 | 1) => rows.reduce((s, r) => s + r[key][i], 0) / n
    const diffs = rows.map((r) => r[key][1] - r[key][0])
    const diff = diffs.reduce((s, d) => s + d, 0) / n
    const se = n > 1 ? Math.sqrt(diffs.reduce((s, d) => s + (d - diff) ** 2, 0) / (n - 1) / n) : Infinity
    return { a: mean(0), b: mean(1), diff, se }
  }
  return { id, label, n, miss: stat('miss'), brier: stat('brier') }
}

// Each model against itself from one track to the next, and each model that
// was handed the ratings against the bare ratings on its own track.
export function trackPairs(data: Data) {
  const on = (track: string) => data.contestants.filter((c) => c.track === track && (c.kind === 'model' || c.kind === 'local'))
  const math = (track: string) => data.contestants.find((c) => c.kind === 'math' && c.track === track)
  const some = (rows: (Paired | null)[]) => rows.filter((r): r is Paired => !!r)
  const against = (track: string) => {
    const m = math(track)
    return m ? some(on(track).map((c) => paired(data, m.id, c.id, c.id, c.label))) : []
  }
  return {
    tracks: some(on('v2').map((c) => paired(data, c.id.replace(/-v2$/, ''), c.id, c.id, c.label))),
    math: against('v2'),
    // Track 3 against track 2: the same model and sheet, with and without its scorecard.
    feedback: some(on('v3').map((c) => paired(data, c.id.replace(/-v3$/, '-v2'), c.id, c.id, c.label))),
    feedbackMath: against('v3'),
  }
}
