// Game breakdown: who picked what, what they were shown, and how that compares
// with the betting market.

import { useRef } from 'react'
import { motion } from 'motion/react'
import { favorite, modelsOf, signed } from '@/lib/card'
import type { Data, Dossier, Game, Week } from '@/lib/card'
import { useStrip } from '@/lib/narrow'

const moneyline = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`)
const raw = (ml: number) => (ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100))

// The market's chance for the home team, with the bookmaker's cut removed.
function marketHome(g: Game): number | null {
  const l = g.line
  if (!l || l.homeMoneyline === null || l.awayMoneyline === null) return null
  const h = raw(l.homeMoneyline)
  return h / (h + raw(l.awayMoneyline))
}

function winRate(record: string) {
  const [w, l, t = 0] = record.split('-').map(Number)
  const n = w + l + t
  return n ? (w + t / 2) / n : null
}

// Which team each number the models were shown points toward.
function edges(g: Game) {
  const { away, home } = g.teams
  const out: { team: string; text: string }[] = []
  const compare = (a: number | null, h: number | null, higherWins: boolean, text: (best: Dossier, other: Dossier) => string) => {
    if (a === null || h === null || a === h) return
    const awayWins = higherWins ? a > h : a < h
    const [best, other] = awayWins ? [away, home] : [home, away]
    out.push({ team: best.abbr, text: text(best, other) })
  }
  compare(winRate(away.record), winRate(home.record), true, (b, o) => `Better record, ${b.record} to ${o.record}`)
  compare(away.pointsFor, home.pointsFor, true, (b, o) => `Scores more: ${b.pointsFor} points a game to ${o.pointsFor}`)
  compare(away.pointsAgainst, home.pointsAgainst, false, (b, o) => `Allows fewer: ${b.pointsAgainst} points a game to ${o.pointsAgainst}`)
  if (!g.neutral) out.push({ team: home.abbr, text: `Playing at home, where it is ${home.homeRecord}` })
  if (away.restDays !== null && home.restDays !== null && Math.abs(away.restDays - home.restDays) >= 2) {
    compare(away.restDays, home.restDays, true, (b, o) => `More rest: ${b.restDays} days to ${o.restDays}`)
  }
  for (const t of [away, home]) {
    const n = t.streak ? Number(t.streak.slice(1)) : 0
    if (t.streak?.startsWith('W') && n >= 2) out.push({ team: t.abbr, text: `Has won ${n} straight` })
    if (t.streak?.startsWith('L') && n >= 2) out.push({ team: t.abbr === away.abbr ? home.abbr : away.abbr, text: `${t.abbr} has lost ${n} straight` })
  }
  return out
}

function TeamPanel({ t, role }: { t: Dossier; role: string }) {
  return (
    <div className="team-panel">
      <h4>
        {t.abbr} <small>{role}</small>
      </h4>
      <p>
        {t.record} overall, {t.homeRecord} home, {t.roadRecord} road
        {t.pointsFor !== null && `. Scores ${t.pointsFor} a game, allows ${t.pointsAgainst}`}
        {t.restDays !== null && `. ${t.restDays} days rest`}.
      </p>
      <ul>
        {t.results.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  )
}

export function againstMarket(g: Game, ids: string[]) {
  const fav = favorite(g)
  const picks = ids.filter((id) => g.picks[id]).map((id) => g.picks[id])
  if (!fav || !picks.length) return false
  return picks.filter((p) => p.winner !== fav).length * 2 > picks.length
}

export function BreakdownView({ data, week, gameKey, onGame }: { data: Data; week: Week; gameKey: string | null; onGame: (key: string) => void }) {
  const models = modelsOf(data).filter((c) => week.games.some((g) => g.picks[c.id]))
  const ids = models.map((c) => c.id)
  const g = week.games.find((x) => x.key === gameKey) ?? week.games.find((x) => againstMarket(x, ids)) ?? week.games[0]
  const entries = models.filter((c) => g.picks[c.id]).map((c) => ({ c, p: g.picks[c.id] }))
  const fav = favorite(g)
  const forHome = entries.filter((e) => e.p.winner === g.home)
  const forAway = entries.filter((e) => e.p.winner === g.away)
  const [major, minor, side] = forHome.length >= forAway.length ? [forHome, forAway, g.home] : [forAway, forHome, g.away]
  const other = side === g.home ? g.away : g.home
  const split = forHome.length === forAway.length
  const avg = (f: (e: (typeof entries)[number]) => number) => Math.round(entries.reduce((s, e) => s + f(e), 0) / entries.length)
  const home = marketHome(g)
  const favChance = home === null || !fav ? null : Math.round((fav === g.home ? home : 1 - home) * 100)
  const against = !split && fav !== null && side !== fav
  const points = edges(g)
  const strip = useRef<HTMLDivElement>(null)
  useStrip(strip, g.key)

  return (
    <div className="why">
      <div className="game-chips strip" ref={strip} role="group" aria-label="Choose a game">
        {week.games.map((x) => (
          <button key={x.key} aria-pressed={x.key === g.key} className={againstMarket(x, ids) ? 'upset' : undefined} onClick={() => onGame(x.key)}>
            {x.away} at {x.home}
          </button>
        ))}
      </div>

      <motion.div key={g.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <div className="verdict">
          <span className={`tag ${against ? 'pink' : 'blue'}`}>
            {split ? 'Models are split' : against ? 'Against the market' : fav ? 'With the market' : 'No favorite'}
          </span>
          <p>
            {split
              ? `${forAway.length} take ${g.away} and ${forHome.length} take ${g.home}.`
              : minor.length === 0
                ? `All ${entries.length} models take ${side}.`
                : `${major.length} of ${entries.length} models take ${side}; ${minor.map((e) => e.c.label).join(' and ')} ${minor.length === 1 ? 'takes' : 'take'} ${other}.`}{' '}
            On average they have it {g.away} {avg((e) => e.p.away_score)}, {g.home} {avg((e) => e.p.home_score)}.
          </p>
          {g.line && fav && (
            <p>
              The market favors {fav} by {Math.abs(g.line.homeLine)}
              {g.line.homeMoneyline !== null && g.line.awayMoneyline !== null && (
                <>
                  {' '}
                  (moneyline {g.home} {moneyline(g.line.homeMoneyline)}, {g.away} {moneyline(g.line.awayMoneyline)})
                </>
              )}
              {favChance !== null && `, which works out to about a ${favChance}% chance that ${fav} wins`}.
            </p>
          )}
          {against && (
            <p className="caveat">
              The models worked only from the results below, plus whatever they remember from training. The line also
              prices in things that were never in the prompt, such as injuries, lineup changes and weather.
            </p>
          )}
        </div>

        <h3>In the numbers they were shown</h3>
        <div className="edges">
          {[g.away, g.home].map((team) => {
            const mine = points.filter((p) => p.team === team)
            return (
              <div key={team}>
                <h4>Points toward {team}</h4>
                {mine.length ? (
                  <ul>
                    {mine.map((p) => (
                      <li key={p.text}>{p.text}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Nothing in the data.</p>
                )}
              </div>
            )
          })}
        </div>

        <h3>What each model said</h3>
        <ul className="said">
          {entries.map(({ c, p }, i) => (
            <li key={c.id}>
              <div className="said-head">
                <strong>{c.label}</strong>
                <span className={fav && p.winner !== fav ? 'dog-pick' : undefined}>
                  {p.winner} {Math.max(p.away_score, p.home_score)}-{Math.min(p.away_score, p.home_score)}
                </span>
                {g.line && <span className="soft">({p.winner === g.home ? g.home : g.away} by {Math.abs(p.home_score - p.away_score)}; line {g.home} {signed(g.line.homeLine)})</span>}
              </div>
              <div className="meter" aria-label={`${Math.round(p.confidence * 100)}% confident`}>
                <motion.i
                  initial={{ width: 0 }}
                  animate={{ width: `${p.confidence * 100}%` }}
                  transition={{ duration: 0.6, delay: i * 0.05 }}
                />
                <span>{Math.round(p.confidence * 100)}% sure</span>
              </div>
              <p>{p.reason}</p>
              {p.flags?.map((f) => (
                <p key={f.claim} className="flag">
                  <b>Flagged by the fact checker:</b> "{f.claim}" The data sheet says: {f.evidence}
                </p>
              ))}
              {p.factors && p.factors.length > 0 && (
                <ol>
                  {p.factors.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>

        <h3>Everything the models were shown about these teams</h3>
        <div className="edges">
          <TeamPanel t={g.teams.away} role="road" />
          <TeamPanel t={g.teams.home} role={g.neutral ? 'neutral site' : 'home'} />
        </div>
      </motion.div>
    </div>
  )
}
