// "Is any of this real?" Everything here is computed from the graded picks
// already in data.json: no new data, just honest error bars.

import type { Data, Game } from '@/lib/card'

// Win rate a spread bettor needs at the standard -110 price.
export const BREAKEVEN = 110 / 210

// 95% Wilson score interval for k wins in n.
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (!n) return [0, 1]
  const p = k / n
  const d = 1 + (z * z) / n
  const mid = (p + (z * z) / (2 * n)) / d
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d
  return [Math.max(0, mid - half), Math.min(1, mid + half)]
}

// One-sided exact binomial: the chance a fair coin wins at least k of n.
export function coinTail(k: number, n: number): number {
  let s = 0
  let c = 1
  for (let i = 0; i <= n; i++) {
    if (i > 0) c = (c * (n - i + 1)) / i
    if (i >= k) s += c * 0.5 ** n
  }
  return Math.min(1, s)
}

// Spread picks needed to tell a true 55% picker from a coin flip, one-sided
// 5% test with 80% power.
export function picksNeeded(edge = 0.55, za = 1.645, zb = 0.8416): number {
  return Math.ceil(((za * 0.5 + zb * Math.sqrt(edge * (1 - edge))) / (edge - 0.5)) ** 2)
}

const implied = (ml: number) => (ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100))

// The closing moneyline's home win chance with the bookmaker's margin removed.
export function marketHome(g: Game): number | null {
  const l = g.line
  if (!l || !l.closing || l.homeMoneyline == null || l.awayMoneyline == null) return null
  const h = implied(l.homeMoneyline)
  const a = implied(l.awayMoneyline)
  return h / (h + a)
}

// Who the closing spread favored, or null on a pick'em.
const favorite = (g: Game) => (!g.line || g.line.homeLine === 0 ? null : g.line.homeLine < 0 ? g.home : g.away)

export interface Evidence {
  id: string
  label: string
  ats: { w: number; l: number; rate: number; ci: [number, number]; coin: number }
  // Model Brier minus market Brier per game: negative means it beat the market.
  market: { n: number; diff: number; se: number; skill: number }
  chalk: { on: number; n: number }
}

export function evidence(data: Data): Evidence[] {
  const out: Evidence[] = []
  const finals = data.weeks.flatMap((w) => w.games).filter((g) => g.status === 'final')
  for (const c of data.contestants) {
    if (c.kind === 'baseline') continue
    let w = 0
    let l = 0
    let chalkOn = 0
    let chalkN = 0
    const diffs: number[] = []
    let mSum = 0
    let bSum = 0
    for (const g of finals) {
      const p = g.picks[c.id]
      if (!p?.grade) continue
      if (p.grade.ats === 'W') w++
      if (p.grade.ats === 'L') l++
      const fav = favorite(g)
      if (fav) {
        chalkN++
        if (p.winner === fav) chalkOn++
      }
      const pm = marketHome(g)
      if (pm != null && g.homeScore != null && g.awayScore != null) {
        const y = g.homeScore > g.awayScore ? 1 : g.homeScore < g.awayScore ? 0 : 0.5
        const mb = (pm - y) ** 2
        diffs.push(p.grade.brier - mb)
        mSum += mb
        bSum += p.grade.brier
      }
    }
    if (!w && !l && !diffs.length) continue
    const n = diffs.length
    const diff = n ? diffs.reduce((s, d) => s + d, 0) / n : 0
    const se = n > 1 ? Math.sqrt(diffs.reduce((s, d) => s + (d - diff) ** 2, 0) / (n - 1) / n) : Infinity
    out.push({
      id: c.id,
      label: c.label,
      ats: { w, l, rate: w + l ? w / (w + l) : 0, ci: wilson(w, w + l), coin: coinTail(w, w + l) },
      market: { n, diff, se, skill: mSum ? 1 - bSum / mSum : 0 },
      chalk: { on: chalkOn, n: chalkN },
    })
  }
  return out.sort((a, b) => b.ats.rate - a.ats.rate)
}

// How often every model on the track picked the same winner. When they all
// agree, their records are mostly one record counted several times.
export function herding(data: Data): { same: number; n: number; models: number } {
  const ids = data.contestants.filter((c) => c.kind === 'model' || c.kind === 'local').map((c) => c.id)
  let same = 0
  let n = 0
  for (const g of data.weeks.flatMap((w) => w.games)) {
    if (g.status !== 'final') continue
    const winners = ids.map((id) => g.picks[id]?.winner).filter(Boolean)
    if (winners.length < 2 || winners.length < ids.length) continue
    n++
    if (winners.every((x) => x === winners[0])) same++
  }
  return { same, n, models: ids.length }
}
