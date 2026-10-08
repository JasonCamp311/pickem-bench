// Private page. It only appears when the page is opened from the local server
// on this machine, which is the only place private/bets.json exists.

import { useState } from 'react'
import { favorite, lineText, margin, modelsOf, signed } from '@/lib/card'
import type { Data, Game, Week } from '@/lib/card'

export interface Bet {
  id: string
  week: number
  game: string
  type: 'spread' | 'total' | 'moneyline'
  side: string
  line: number | null
  odds: number
  stake: number
  placedAt: string
}

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`
const profit = (b: Bet) => (b.odds > 0 ? (b.stake * b.odds) / 100 : (b.stake * 100) / -b.odds)

// Settles a bet from the final score, or null while the game is unplayed.
function settle(b: Bet, data: Data): 'won' | 'lost' | 'push' | null {
  const g = data.weeks.find((w) => w.week === b.week)?.games.find((x) => x.key === b.game)
  if (!g || g.status !== 'final' || g.homeScore === null || g.awayScore === null) return null
  const diff = g.homeScore - g.awayScore
  let edge: number
  if (b.type === 'total') edge = (g.homeScore + g.awayScore - (b.line ?? 0)) * (b.side === 'over' ? 1 : -1)
  else edge = (b.side === g.home ? diff : -diff) + (b.type === 'spread' ? (b.line ?? 0) : 0)
  return edge > 0 ? 'won' : edge < 0 ? 'lost' : 'push'
}

function edges(data: Data, week: Week) {
  const models = modelsOf(data)
  return week.games
    .filter((g) => g.status === 'scheduled' && g.line)
    .map((g) => {
      const picks = models.filter((c) => g.picks[c.id]).map((c) => g.picks[c.id])
      const avg = picks.reduce((s, p) => s + margin(p), 0) / (picks.length || 1)
      const edge = avg + g.line!.homeLine
      const side = edge > 0 ? g.home : g.away
      const sideLine = edge > 0 ? g.line!.homeLine : -g.line!.homeLine
      const agree = picks.filter((p) => (margin(p) + g.line!.homeLine > 0) === edge > 0 && margin(p) + g.line!.homeLine !== 0).length
      const total = picks.reduce((s, p) => s + p.home_score + p.away_score, 0) / (picks.length || 1)
      const totalEdge = g.line!.total === null ? null : total - g.line!.total
      const overs = g.line!.total === null ? 0 : picks.filter((p) => p.home_score + p.away_score > g.line!.total!).length
      return { g, n: picks.length, avg, edge: Math.abs(edge), side, sideLine, agree, totalEdge, overs }
    })
    .filter((r) => r.n > 0)
    .sort((a, b) => b.edge - a.edge)
}

export function BettingView({ data, week, bets, onSave }: { data: Data; week: Week; bets: Bet[]; onSave: (bets: Bet[]) => void }) {
  const open = week.games.filter((g) => g.status === 'scheduled')
  const [gameKey, setGameKey] = useState(open[0]?.key ?? week.games[0].key)
  const [type, setType] = useState<Bet['type']>('spread')
  const game = week.games.find((g) => g.key === gameKey) as Game
  const sides = type === 'total' ? ['over', 'under'] : [game.away, game.home]
  const [sideRaw, setSide] = useState(sides[0])
  const side = sides.includes(sideRaw) ? sideRaw : sides[0]
  const [odds, setOdds] = useState('-110')
  const [stake, setStake] = useState('10')
  const suggested =
    type === 'total' ? game.line?.total ?? null : type === 'spread' && game.line ? (side === game.home ? game.line.homeLine : -game.line.homeLine) : null
  const [lineRaw, setLine] = useState<string | null>(null)
  const line = type === 'moneyline' ? null : lineRaw !== null && lineRaw !== '' ? Number(lineRaw) : suggested

  const add = () => {
    const o = Number(odds)
    const s = Number(stake)
    if (!Number.isFinite(o) || o === 0 || !Number.isFinite(s) || s <= 0) return
    if (type !== 'moneyline' && (line === null || !Number.isFinite(line))) return
    onSave([...bets, { id: `${Date.now()}`, week: week.week, game: gameKey, type, side, line, odds: o, stake: s, placedAt: new Date().toISOString() }])
    setLine(null)
  }

  const settled = bets.map((b) => ({ b, result: settle(b, data) }))
  const net = settled.reduce((s, { b, result }) => s + (result === 'won' ? profit(b) : result === 'lost' ? -b.stake : 0), 0)
  const count = (r: string) => settled.filter((x) => x.result === r).length
  const pending = settled.filter((x) => x.result === null)
  const rows = edges(data, week)
  const describe = (b: Bet) =>
    b.type === 'total' ? `${b.side} ${b.line}` : b.type === 'spread' ? `${b.side} ${signed(b.line ?? 0)}` : `${b.side} to win`

  return (
    <>
      <section className="sheet">
        <div className="sheet-head">
          <h2>Where the models lean hardest</h2>
          <p>Private to this machine. Week {week.week}, games not yet played.</p>
        </div>
        {rows.length === 0 ? (
          <p className="empty">No unplayed games with a line this week.</p>
        ) : (
          <div className="scroll">
            <table className="card-table">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Line</th>
                  <th>Models' average</th>
                  <th>Spread side</th>
                  <th className="num">Gap to the line</th>
                  <th className="num">Models on that side</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.g.key}>
                    <th scope="row">
                      {r.g.away} at {r.g.home}
                    </th>
                    <td>{lineText(r.g)}</td>
                    <td>
                      {r.avg === 0 ? 'Even' : `${r.avg > 0 ? r.g.home : r.g.away} by ${Math.abs(r.avg).toFixed(1)}`}
                      {favorite(r.g) && Math.sign(r.avg) !== Math.sign(-r.g.line!.homeLine) && r.avg !== 0 && <small>against the favorite</small>}
                    </td>
                    <td>
                      {r.side} {signed(r.sideLine)}
                    </td>
                    <td className="num">{r.edge.toFixed(1)} pts</td>
                    <td className="num">
                      {r.agree} of {r.n}
                    </td>
                    <td>
                      {r.totalEdge === null
                        ? ''
                        : `${r.totalEdge > 0 ? 'over' : 'under'} ${r.g.line!.total} by ${Math.abs(r.totalEdge).toFixed(1)} (${r.totalEdge > 0 ? r.overs : r.n - r.overs} of ${r.n})`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="key">
          A big gap means the models disagree with the market, not that the market is wrong. These models have no track
          record yet, and the line knows about injuries they were never told about. Check the standings before trusting
          any of this.
        </p>
      </section>

      <section className="sheet">
        <div className="sheet-head">
          <h2>My bets</h2>
          <p>
            {count('won')}-{count('lost')}
            {count('push') ? `-${count('push')}` : ''} settled, {money(net)} net, {pending.length} pending (
            {money(pending.reduce((s, x) => s + x.b.stake, 0))} at risk).
          </p>
        </div>
        <form
          className="bet-form"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <label>
            Game
            <select value={gameKey} onChange={(e) => { setGameKey(e.target.value); setLine(null) }}>
              {week.games.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.away} at {g.home}
                </option>
              ))}
            </select>
          </label>
          <label>
            Bet
            <select value={type} onChange={(e) => { setType(e.target.value as Bet['type']); setLine(null) }}>
              <option value="spread">Spread</option>
              <option value="total">Total</option>
              <option value="moneyline">Moneyline</option>
            </select>
          </label>
          <label>
            Side
            <select value={side} onChange={(e) => { setSide(e.target.value); setLine(null) }}>
              {sides.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          {type !== 'moneyline' && (
            <label>
              Line
              <input inputMode="decimal" value={lineRaw ?? (suggested === null ? '' : String(suggested))} onChange={(e) => setLine(e.target.value)} />
            </label>
          )}
          <label>
            Odds
            <input inputMode="numeric" value={odds} onChange={(e) => setOdds(e.target.value)} />
          </label>
          <label>
            Stake ($)
            <input inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} />
          </label>
          <button type="submit">Add bet</button>
        </form>
        {bets.length === 0 ? (
          <p className="empty">No bets logged. Add one above; it is saved to private/bets.json on this computer only.</p>
        ) : (
          <div className="scroll">
            <table className="card-table">
              <thead>
                <tr>
                  <th>Bet</th>
                  <th className="num">Odds</th>
                  <th className="num">Stake</th>
                  <th>Result</th>
                  <th className="num">Net</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...settled].reverse().map(({ b, result }) => (
                  <tr key={b.id}>
                    <th scope="row">
                      {describe(b)}
                      <small>
                        Week {b.week}, {b.game.replace('@', ' at ')}
                      </small>
                    </th>
                    <td className="num">{b.odds > 0 ? `+${b.odds}` : `−${Math.abs(b.odds)}`}</td>
                    <td className="num">{money(b.stake)}</td>
                    <td className={result === 'won' ? 'W' : result === 'lost' ? 'L' : ''}>{result ?? 'pending'}</td>
                    <td className="num">{result === 'won' ? money(profit(b)) : result === 'lost' ? money(-b.stake) : result === 'push' ? money(0) : ''}</td>
                    <td>
                      <button type="button" className="link" onClick={() => onSave(bets.filter((x) => x.id !== b.id))}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
