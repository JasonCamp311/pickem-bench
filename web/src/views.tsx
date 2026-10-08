// The four views under the tab bar: the card, models vs the line, agreement, profiles.

import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import CountUp from '@/components/CountUp'
import SpotlightCard from '@/components/SpotlightCard'
import WarmTooltip, { WarmTooltipGroup } from '@/components/WarmTooltip'
import {
  agreement, code, dayLabel, favorite, kickTime, kindNote, lineText, margin, modelsOf, profile, signed, takes, totalLean,
} from '@/lib/card'
import type { Contestant, Data, Game, Pick, Week } from '@/lib/card'
import { useNarrow } from '@/lib/narrow'

// longPress 0: a finger opens a tooltip with a tap instead of a half-second hold.
const TIP = { surfaceColor: '#e9ecff', inkColor: '#0b0e2a', radius: 3, size: 'md', longPress: 0 } as const
const record = (r: number[]) => `${r[0]}-${r[1]}${r[2] ? `-${r[2]}` : ''}`
const suMark = { W: ' ✓', L: ' ✗', T: '' }

/* ---------- The card ---------- */

function PickCell({ g, c, p, week }: { g: Game; c: Contestant; p: Pick; week: Week }) {
  const base = c.kind === 'baseline'
  const shaded = base || c.kind === 'consensus'
  const fav = favorite(g)
  const grade = p.grade
  const calls = week.entries[c.id]
  const main = (
    <div className={`pick${grade ? ` ${grade.su}` : ''}`} tabIndex={p.reason ? 0 : undefined}>
      <span className={`team${fav && p.winner !== fav ? ' dog' : ''}`}>{p.winner}</span>
      {!base && (
        <span className="score">
          {Math.max(p.away_score, p.home_score)}-{Math.min(p.away_score, p.home_score)}
        </span>
      )}
      {grade && (grade.exact ? ' ★' : suMark[grade.su])}
    </div>
  )
  const side = base ? (c.id === 'base-home' && g.line ? `${g.home} ${signed(g.line.homeLine)}` : null) : takes(g, p)
  const lean = base ? null : totalLean(g, p)
  return (
    <td className={shaded ? 'house' : undefined}>
      {p.reason ? (
        <WarmTooltip content={p.reason} side="top" {...TIP}>
          {main}
        </WarmTooltip>
      ) : (
        main
      )}
      {!base && <small>{Math.round(p.confidence * 100)}% sure</small>}
      {(calls?.lock?.game === g.key || calls?.upset?.game === g.key || p.first_half) && (
        <small className="calls">
          {calls?.lock?.game === g.key && <b>Lock of the week</b>}
          {calls?.upset?.game === g.key && <b>Upset call</b>}
          {p.first_half && <span className={grade?.fh ?? undefined}>{p.first_half} at the half</span>}
        </small>
      )}
      <div className="chips">
        {side && <span className={`chip ${grade?.ats ?? ''}`}>{side}</span>}
        {lean && <span className={`chip ${grade?.ou ?? ''}`}>{lean}</span>}
      </div>
    </td>
  )
}

// One contestant's pick inside an opened game on a phone. The reason is
// printed in full, since there is no hover to hide it behind.
function PickRow({ g, c, p, week }: { g: Game; c: Contestant; p: Pick; week: Week }) {
  const base = c.kind === 'baseline'
  const fav = favorite(g)
  const grade = p.grade
  const calls = week.entries[c.id]
  const side = base ? (c.id === 'base-home' && g.line ? `${g.home} ${signed(g.line.homeLine)}` : null) : takes(g, p)
  const lean = base ? null : totalLean(g, p)
  const lock = calls?.lock?.game === g.key
  const upset = calls?.upset?.game === g.key
  return (
    <li className={base || c.kind === 'consensus' ? 'house' : undefined}>
      <div className="game-pick">
        <span className="game-who">{c.label}</span>
        <span className={`pick${grade ? ` ${grade.su}` : ''}`}>
          <span className={`team${fav && p.winner !== fav ? ' dog' : ''}`}>{p.winner}</span>
          {!base && (
            <span className="score">
              {Math.max(p.away_score, p.home_score)}-{Math.min(p.away_score, p.home_score)}
            </span>
          )}
          {grade && (grade.exact ? ' ★' : suMark[grade.su])}
        </span>
        {!base && <span className="soft">{Math.round(p.confidence * 100)}%</span>}
      </div>
      {(side || lean || lock || upset || p.first_half) && (
        <div className="chips">
          {side && <span className={`chip ${grade?.ats ?? ''}`}>{side}</span>}
          {lean && <span className={`chip ${grade?.ou ?? ''}`}>{lean}</span>}
          {p.first_half && <span className={`chip ${grade?.fh ?? ''}`}>{p.first_half} at the half</span>}
          {lock && <b>Lock of the week</b>}
          {upset && <b>Upset call</b>}
        </div>
      )}
      {p.reason && <p>{p.reason}</p>}
    </li>
  )
}

// The card on a phone: one row per game showing which models are on which
// team. Opening a game lists every contestant's pick.
function CardList({ week, cols, days, onOpen }: { week: Week; cols: Contestant[]; days: string[]; onOpen: (key: string) => void }) {
  const models = cols.filter((c) => c.kind === 'model' || c.kind === 'local')
  return (
    <div className="games">
      {days.map((day) => (
        <Fragment key={day}>
          <h3 className="games-day">{day}</h3>
          {week.games
            .filter((g) => dayLabel(g.kickoff) === day)
            .map((g) => {
              const fav = favorite(g)
              const final = g.status === 'final' && g.awayScore !== null && g.homeScore !== null
              const won = final ? (g.awayScore! > g.homeScore! ? g.away : g.homeScore! > g.awayScore! ? g.home : null) : null
              const sides = [g.away, g.home].map((team) => ({ team, on: models.filter((c) => g.picks[c.id]?.winner === team) }))
              return (
                <details key={g.key} className="game">
                  <summary>
                    <span className="game-top">
                      <span>{final ? 'Final' : kickTime(g.kickoff)}</span>
                      <span>
                        {g.line?.closing ? 'Closed' : 'Line'} {lineText(g)}
                        {g.line?.total != null ? `, total ${g.line.total}` : ''}
                      </span>
                    </span>
                    {sides.map(({ team, on }) => (
                      <span key={team} className={`game-side${final ? (team === won ? ' W' : ' L') : ''}${on.length ? '' : ' none'}`}>
                        <span className="match">
                          <span className={`team${fav && team !== fav && on.length ? ' dog' : ''}`}>{team}</span>
                        </span>
                        <b>{on.length}</b>
                        <span className="game-codes">
                          {on.map((c) => (
                            <span key={c.id} className="vs-dot static">
                              {code(c)}
                            </span>
                          ))}
                        </span>
                        {final && <span className="game-score">{team === g.away ? g.awayScore : g.homeScore}</span>}
                      </span>
                    ))}
                  </summary>
                  <ul className="game-picks">
                    {cols.map((c) => g.picks[c.id] && <PickRow key={c.id} g={g} c={c} p={g.picks[c.id]} week={week} />)}
                  </ul>
                  <button className="game-more" onClick={() => onOpen(g.key)}>
                    Full breakdown of {g.away} at {g.home}
                  </button>
                </details>
              )
            })}
        </Fragment>
      ))}
      <ul className="legend">
        {models.map((c) => (
          <li key={c.id}>
            <span className="vs-dot static">{code(c)}</span>
            {c.label}
          </li>
        ))}
      </ul>
      <p className="key">
        The road team is on top. Each row shows which models picked that team; tap a game for every score, the reasons
        and the baselines. A{' '}
        <span className="team dog">circled</span> team is a pick against the betting favorite. The tags under a pick
        are the sides of the spread and the total that the predicted score lands on; the models never saw either number.
      </p>
    </div>
  )
}

export function CardView({ data, week, onOpen }: { data: Data; week: Week; onOpen: (key: string) => void }) {
  const narrow = useNarrow()
  const cols = data.contestants.filter((c) => week.games.some((g) => g.picks[c.id]))
  const days = [...new Set(week.games.map((g) => dayLabel(g.kickoff)))]
  if (narrow) return <CardList week={week} cols={cols} days={days} onOpen={onOpen} />
  return (
    <>
      <div className="scroll">
        <WarmTooltipGroup>
          <table className="card-table">
            <thead>
              <tr>
                <th>Game</th>
                {cols.map((c) => {
                  const t = week.totals[c.id]
                  return (
                    <th key={c.id} scope="col" className={c.kind === 'baseline' || c.kind === 'consensus' ? 'house' : undefined}>
                      {c.label}
                      <small>
                        {t
                          ? `${record(t.su)} straight up${t.atsN ? `, ${record(t.ats)} spread` : ''}`
                          : (kindNote[c.kind] ?? ' ')}
                      </small>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <Fragment key={day}>
                  <tr className="day">
                    <th colSpan={cols.length + 1}>{day}</th>
                  </tr>
                  {week.games
                    .filter((g) => dayLabel(g.kickoff) === day)
                    .map((g) => (
                      <tr key={g.key}>
                        <th scope="row">
                          <button className="match" onClick={() => onOpen(g.key)} title="See why they picked it">
                            {g.away} at {g.home}
                          </button>
                          <small>
                            {g.status === 'final' ? `Final ${g.awayScore}-${g.homeScore}` : kickTime(g.kickoff)}
                          </small>
                          <small>
                            {g.line?.closing ? 'Closed' : 'Line'} {lineText(g)}
                            {g.line?.total != null ? `, total ${g.line.total}` : ''}
                          </small>
                        </th>
                        {cols.map((c) =>
                          g.picks[c.id] ? <PickCell key={c.id} g={g} c={c} p={g.picks[c.id]} week={week} /> : <td key={c.id} />,
                        )}
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </WarmTooltipGroup>
      </div>
      <p className="key">
        A <span className="team dog">circled</span> team is a pick against the betting favorite. The two tags under each
        pick are the sides of the spread and the total that the predicted score lands on; the models never saw either
        number. Hover or focus a pick for the model's one-line reason, or select a game for the full breakdown.
      </p>
    </>
  )
}

/* ---------- Models vs the line ---------- */

function LineRow({ g, models, reach, index, room }: { g: Game; models: Contestant[]; reach: number; index: number; room: number }) {
  const pos = (v: number) => 50 + (Math.max(-reach, Math.min(reach, v)) / reach) * 50
  const entries = models.filter((c) => g.picks[c.id]).map((c) => ({ c, p: g.picks[c.id], m: margin(g.picks[c.id]) }))
  // Dots closer together than one dot width (`room`, in points of margin)
  // stack upward instead of hiding each other.
  const levels: number[][] = []
  const dots = [...entries].sort((a, b) => a.m - b.m).map((e) => {
    let level = levels.findIndex((taken) => taken.every((m) => Math.abs(m - e.m) >= room))
    if (level === -1) level = levels.push([]) - 1
    levels[level].push(e.m)
    return { ...e, level }
  })
  const tallest = Math.max(1, levels.length)
  const lineAt = g.line ? -g.line.homeLine : null
  const awaySide = g.line ? entries.filter((e) => e.m + g.line!.homeLine < 0).length : null
  const homeSide = g.line ? entries.filter((e) => e.m + g.line!.homeLine > 0).length : null
  const final = g.status === 'final' && g.homeScore !== null && g.awayScore !== null ? g.homeScore - g.awayScore : null

  return (
    <div className="vs-row">
      <div className="vs-team">
        {g.away}
        {awaySide !== null && <small>{awaySide} on this side</small>}
      </div>
      <div className="vs-track" style={{ height: 30 + (tallest - 1) * 22 }}>
        {[-21, -14, -7, 7, 14, 21].filter((t) => Math.abs(t) < reach).map((t) => (
          <i key={t} className="vs-grid" style={{ left: `${pos(t)}%` }} />
        ))}
        <i className="vs-zero" />
        {/* The tooltip adds its own wrapper, so position lives on an outer slot. */}
        {lineAt !== null && (
          <motion.span
            className="vs-slot tall"
            initial={{ left: '50%', opacity: 0 }}
            animate={{ left: `${pos(lineAt)}%`, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 120, damping: 18, delay: index * 0.03 }}
          >
            <WarmTooltip className="h-full" content={`Betting line: ${lineText(g)}`} side="top" {...TIP}>
              <span className="vs-line" tabIndex={0} />
            </WarmTooltip>
          </motion.span>
        )}
        {final !== null && (
          <span className="vs-slot tall" style={{ left: `${pos(final)}%` }}>
            <WarmTooltip className="h-full" content={`Final: ${g.away} ${g.awayScore}, ${g.home} ${g.homeScore}`} side="top" {...TIP}>
              <span className="vs-final" tabIndex={0} />
            </WarmTooltip>
          </span>
        )}
        {dots.map(({ c, p, m, level }, i) => (
          <motion.span
            key={c.id}
            className="vs-slot"
            style={{ bottom: 4 + level * 22 }}
            initial={{ left: '50%', opacity: 0 }}
            animate={{ left: `${pos(m)}%`, opacity: 1 }}
            whileHover={{ scale: 1.25 }}
            transition={{ type: 'spring', stiffness: 140, damping: 16, delay: index * 0.03 + i * 0.04 }}
          >
            <WarmTooltip
              content={`${c.label}: ${p.winner} ${Math.max(p.away_score, p.home_score)}-${Math.min(p.away_score, p.home_score)} (by ${Math.abs(m)})`}
              side="top"
              {...TIP}
            >
              <span className="vs-dot" tabIndex={0}>
                {code(c)}
              </span>
            </WarmTooltip>
          </motion.span>
        ))}
      </div>
      <div className="vs-team">
        {g.home}
        {homeSide !== null && <small>{homeSide} on this side</small>}
      </div>
    </div>
  )
}

export function VsLineView({ data, week }: { data: Data; week: Week }) {
  const models = modelsOf(data).filter((c) => week.games.some((g) => g.picks[c.id]))
  const biggest = Math.max(
    14,
    ...week.games.flatMap((g) => [
      ...models.filter((c) => g.picks[c.id]).map((c) => Math.abs(margin(g.picks[c.id]))),
      g.line ? Math.abs(g.line.homeLine) : 0,
    ]),
  )
  const reach = Math.ceil((biggest + 1) / 7) * 7
  // Track width in pixels decides how many points of margin one dot covers.
  const scale = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(560)
  useLayoutEffect(() => {
    const el = scale.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth || 560)
    measure()
    const watcher = new ResizeObserver(measure)
    watcher.observe(el)
    return () => watcher.disconnect()
  }, [])
  const room = (27 / width) * reach * 2
  const pos = (v: number) => 50 + (v / reach) * 50
  const ticks = [-21, -14, -7, 7, 14, 21].filter((t) => Math.abs(t) < reach)
  return (
    <div className="vs">
      <p className="lede">
        Each dot is one model's predicted margin. The pink bar is the betting line. A dot to the right of the bar means
        that model has the home team beating the spread; to the left, the road team.
      </p>
      <ul className="legend">
        {models.map((c) => (
          <li key={c.id}>
            <span className="vs-dot static">{code(c)}</span>
            {c.label}
          </li>
        ))}
        <li>
          <span className="vs-line static" />
          Betting line
        </li>
      </ul>
      <div className="vs-axis">
        <span />
        <div className="vs-scale" ref={scale}>
          <div className="vs-ends">
            <span>Road team wins by</span>
            <span>Home team wins by</span>
          </div>
          <div className="vs-ticks">
            {ticks.map((t) => (
              <span key={t} style={{ left: `${pos(t)}%` }}>
                {Math.abs(t)}
              </span>
            ))}
            <span style={{ left: '50%' }}>Even</span>
          </div>
        </div>
        <span />
      </div>
      <WarmTooltipGroup>
        {week.games.map((g, i) => (
          <LineRow key={g.key} g={g} models={models} reach={reach} index={i} room={room} />
        ))}
      </WarmTooltipGroup>
    </div>
  )
}

/* ---------- Who agrees ---------- */

export function AgreementView({ data, week }: { data: Data; week: Week }) {
  const models = modelsOf(data).filter((c) => week.games.some((g) => g.picks[c.id]))
  const { agree, games } = agreement(week, models)
  const pairs = models.flatMap((a, i) => models.slice(i + 1).map((b, k) => ({ a, b, n: agree[i][i + 1 + k] })))
  if (!pairs.length || !games) return <p className="empty">Agreement needs at least two models on the same games.</p>
  const lo = Math.min(...pairs.map((p) => p.n))
  const hi = Math.max(...pairs.map((p) => p.n))
  const most = pairs.find((p) => p.n === hi)!
  const least = pairs.find((p) => p.n === lo)!
  return (
    <div className="agree">
      <p className="lede">
        How often each pair of models picked the same winner, out of {games} games. Closest pair: {most.a.label} and{' '}
        {most.b.label} ({most.n}). Furthest apart: {least.a.label} and {least.b.label} ({least.n}).
      </p>
      <div className="scroll">
        <WarmTooltipGroup>
          <table className="heat">
            <thead>
              <tr>
                <td />
                {models.map((c) => (
                  <th key={c.id} scope="col">
                    <span className="wide">{c.label}</span>
                    <abbr className="narrow" title={c.label}>
                      {code(c)}
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.map((a, i) => (
                <tr key={a.id}>
                  <th scope="row">
                    <span className="narrow heat-code">{code(a)}</span>
                    {a.label}
                  </th>
                  {models.map((b, j) => {
                    if (i === j) return <td key={b.id} className="self" />
                    const n = agree[i][j]
                    const heat = hi === lo ? 1 : (n - lo) / (hi - lo)
                    return (
                      <td key={b.id}>
                        <WarmTooltip content={`${a.label} and ${b.label} agree on ${n} of ${games} winners`} side="top" {...TIP}>
                          <motion.span
                            className="heat-cell"
                            tabIndex={0}
                            style={{ background: `rgba(76, 201, 255, ${0.1 + heat * 0.75})`, color: heat > 0.55 ? '#0b0e2a' : '#e9ecff' }}
                            initial={{ scale: 0.4, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            whileHover={{ scale: 1.08 }}
                            transition={{ type: 'spring', stiffness: 220, damping: 18, delay: (i + j) * 0.03 }}
                          >
                            {n}
                          </motion.span>
                        </WarmTooltip>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </WarmTooltipGroup>
      </div>
    </div>
  )
}

/* ---------- Model profiles ---------- */

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="stat">
      <dd>{children}</dd>
      <dt>{label}</dt>
    </div>
  )
}

export function ProfilesView({ data, week }: { data: Data; week: Week }) {
  const models = modelsOf(data).filter((c) => week.games.some((g) => g.picks[c.id]))
  return (
    <div className="profiles">
      {models.map((c, i) => {
        const p = profile(week, c, models)
        return (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.06 }}
          >
            <SpotlightCard className="profile" spotlightColor="rgba(255, 95, 174, 0.18)">
              <h3>
                {c.label}
                {kindNote[c.kind] && <small>{kindNote[c.kind]}</small>}
              </h3>
              <dl>
                <Stat label="picks against the favorite">
                  <CountUp to={p.upsets} duration={1} /> of {p.games}
                </Stat>
                <Stat label="average confidence">
                  <CountUp to={Math.round(p.confidence * 100)} duration={1} />%
                </Stat>
                <Stat label="home teams picked">
                  <CountUp to={p.home} duration={1} />
                </Stat>
                <Stat label="picks nobody else made">
                  <CountUp to={p.alone} duration={1} />
                </Stat>
                <Stat label="favorites / underdogs against the spread">
                  <CountUp to={p.favSides} duration={1} /> / <CountUp to={p.dogSides} duration={1} />
                </Stat>
                <Stat label="overs / unders on the total">
                  <CountUp to={p.overs} duration={1} /> / <CountUp to={p.unders} duration={1} />
                </Stat>
                <Stat label="average points per game predicted">{p.points.toFixed(1)}</Stat>
                <Stat label="average winning margin predicted">{p.winBy.toFixed(1)}</Stat>
              </dl>
              <p>Boldest call: {p.boldest}</p>
            </SpotlightCard>
          </motion.div>
        )
      })}
    </div>
  )
}
