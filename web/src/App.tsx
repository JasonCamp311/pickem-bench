import { useEffect, useMemo, useState } from 'react'
import CountUp from '@/components/CountUp'
import Noise from '@/components/Noise'
import ScrollVelocity from '@/components/ScrollVelocity'
import SplitFlapText from '@/components/SplitFlapText'
import WarmTooltip, { WarmTooltipGroup } from '@/components/WarmTooltip'
import { favorite, headlines, kick, kindNote, lineText, pct, signed, takes } from '@/lib/card'
import type { Contestant, Data, Game, Pick, Totals, Week } from '@/lib/card'

const FLAP = {
  charset: "ABCDEFGHIJKLMNOPQRSTUVWXYZ'",
  tileColor: '#161c52',
  tileRadius: 3,
  fontSize: 'clamp(44px, 11vw, 108px)',
  flipsPerChar: 5,
  // Both rows are padded to the longer word, like a real board.
  padTo: 7,
  loop: false,
} as const

function Masthead({ count }: { count: number }) {
  return (
    <header className="masthead">
      <h1 aria-label="Pick'em Bench">
        <SplitFlapText className="flap-pink" text="PICK'EM" textColor="#ff5fae" {...FLAP} />
        <SplitFlapText className="flap-blue" text="BENCH" textColor="#4cc9ff" {...FLAP} />
      </h1>
      <p>
        {count ? `${count} AI models` : 'AI models'} fill out the same NFL card every week. They get schedules, records
        and scores, and never see a betting line. Then the games are played.
      </p>
    </header>
  )
}

function Ticker({ items }: { items: string[] }) {
  if (!items.length) return null
  const row = items.map((text) => (
    <span className="ticker-item" key={text}>
      {text}
    </span>
  ))
  return (
    <div className="ticker" aria-label="This week's talking points">
      <ScrollVelocity
        texts={[row]}
        velocity={38}
        numCopies={4}
        scrollerStyle={{ font: '600 17px/1.4 var(--body)', fontStretch: '88%', letterSpacing: 0, filter: 'none' }}
      />
    </div>
  )
}

function Tally({ r }: { r: number[] }) {
  return (
    <>
      <CountUp to={r[0]} duration={1} />-<CountUp to={r[1]} duration={1} />
      {r[2] ? `-${r[2]}` : ''}
    </>
  )
}

function Standings({ data }: { data: Data }) {
  const rows = data.contestants
    .map((c) => ({ c, t: data.totals[c.id] }))
    .filter((r): r is { c: Contestant; t: Totals } => !!r.t && r.t.n > 0)
  const ats = (t: Totals) => (t.ats[0] + t.ats[1] ? t.ats[0] / (t.ats[0] + t.ats[1]) : -1)
  rows.sort((a, b) => ats(b.t) - ats(a.t) || b.t.su[0] - a.t.su[0])
  const next = data.weeks
    .flatMap((w) => w.games)
    .filter((g) => g.status === 'scheduled')
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0]

  return (
    <section className="sheet" aria-labelledby="standings-title">
      <div className="sheet-head">
        <h2 id="standings-title">Standings</h2>
        {rows.length > 0 && <p>Ranked by record against the spread.</p>}
      </div>
      {rows.length === 0 ? (
        <p className="empty">
          Nothing graded yet.{next ? ` First up: ${next.away} at ${next.home}, ${kick(next.kickoff)}.` : ''}
        </p>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Contestant</th>
                <th className="num">Straight up</th>
                <th className="num">Against the spread</th>
                <th className="num">Exact finals</th>
                <th className="num">Team scores hit</th>
                <th className="num">Brier score</th>
                <th className="num">Average margin miss</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, t }) => {
                const base = c.kind === 'baseline'
                return (
                  <tr key={c.id} className={base ? 'house' : undefined}>
                    <th scope="row">
                      {c.label}
                      {kindNote[c.kind] && <small>{kindNote[c.kind]}</small>}
                    </th>
                    <td className="num">
                      <Tally r={t.su} />
                      <small>{pct(t.su[0], t.su[1])}</small>
                    </td>
                    <td className="num">
                      {t.atsN > 0 && (
                        <>
                          <Tally r={t.ats} />
                          <small>{pct(t.ats[0], t.ats[1])}</small>
                        </>
                      )}
                    </td>
                    <td className="num">{base ? '' : t.exact}</td>
                    <td className="num">{base ? '' : t.teamHits}</td>
                    <td className="num">{(t.brierSum / t.n).toFixed(3)}</td>
                    <td className="num">{base ? '' : (t.marginErrorSum / t.n).toFixed(1)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

const record = (r: number[]) => `${r[0]}-${r[1]}${r[2] ? `-${r[2]}` : ''}`
const suMark = { W: ' ✓', L: ' ✗', T: '' }
const atsMark = { W: ' ✓', L: ' ✗', P: ' push' }

function PickCell({ g, c, p }: { g: Game; c: Contestant; p: Pick }) {
  const base = c.kind === 'baseline'
  const fav = favorite(g)
  const grade = p.grade
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
  const side = takes(g, p)
  return (
    <td className={base ? 'house' : undefined}>
      {p.reason ? (
        <WarmTooltip content={p.reason} side="top" size="md" surfaceColor="#e9ecff" inkColor="#0b0e2a" radius={3}>
          {main}
        </WarmTooltip>
      ) : (
        main
      )}
      {!base && (
        <small className={grade?.ats ?? undefined}>
          {Math.round(p.confidence * 100)}%{side ? `, takes ${side}` : ''}
          {grade?.ats ? atsMark[grade.ats] : ''}
        </small>
      )}
      {c.id === 'base-home' && g.line && <small>takes {g.home} {signed(g.line.homeLine)}</small>}
    </td>
  )
}

function Card({ data, week, onPick }: { data: Data; week: Week; onPick: (w: Week) => void }) {
  const cols = data.contestants.filter((c) => week.games.some((g) => g.picks[c.id]))
  const finals = week.games.filter((g) => g.status === 'final').length
  return (
    <section className="sheet" aria-labelledby="card-title">
      <div className="sheet-head">
        <h2 id="card-title">The card</h2>
        <p>
          Week {week.week}: {week.games.length} games, {finals ? `${finals} final` : 'picks locked'}.
        </p>
        <div className="weeks">
          {data.weeks.map((w) => (
            <button key={w.week} aria-pressed={w.week === week.week} onClick={() => onPick(w)}>
              Week {w.week}
            </button>
          ))}
        </div>
      </div>
      <div className="scroll">
        <WarmTooltipGroup>
          <table>
            <thead>
              <tr>
                <th>Game</th>
                {cols.map((c) => {
                  const t = week.totals[c.id]
                  return (
                    <th key={c.id} scope="col" className={c.kind === 'baseline' ? 'house' : undefined}>
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
              {week.games.map((g) => (
                <tr key={g.key}>
                  <th scope="row">
                    <div className="match">
                      {g.away} at {g.home}
                    </div>
                    <small>{g.status === 'final' ? `Final ${g.awayScore}-${g.homeScore}` : kick(g.kickoff)}</small>
                    <small>
                      {g.line?.closing ? 'Closed' : 'Line'} {lineText(g)}
                    </small>
                  </th>
                  {cols.map((c) =>
                    g.picks[c.id] ? <PickCell key={c.id} g={g} c={c} p={g.picks[c.id]} /> : <td key={c.id} />,
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </WarmTooltipGroup>
      </div>
      <p className="key">
        A <span className="team">circled</span> team is a pick against the betting favorite. "Takes" is the side of the
        spread a model's predicted score lands on; the models never saw the number. Hover or focus a pick for the
        model's one-line reason.
      </p>
    </section>
  )
}

export default function App() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [weekNo, setWeekNo] = useState<number | null>(null)

  useEffect(() => {
    fetch('data.json', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setData)
      .catch((err: Error) => setError(err.message))
  }, [])

  const week = data ? (data.weeks.find((w) => w.week === weekNo) ?? data.weeks[data.weeks.length - 1]) : undefined
  const ticker = useMemo(() => (data && week ? headlines(data, week) : []), [data, week])
  const models = data ? data.contestants.filter((c) => c.kind !== 'baseline').length : 0

  return (
    <>
      <main>
        <Masthead count={models} />
        {error && (
          <section className="sheet">
            <p className="empty">The results file did not load ({error}). Run "node src/cli.js build" and reload.</p>
          </section>
        )}
        {data && (
          <>
            <Ticker items={ticker} />
            <Standings data={data} />
            {week ? (
              <Card data={data} week={week} onPick={(w) => setWeekNo(w.week)} />
            ) : (
              <section className="sheet">
                <p className="empty">No card yet. Run "node src/cli.js pick" to fill one out.</p>
              </section>
            )}
            <footer>
              A star is an exact final score. Brier score measures how honest the win probabilities were: lower is
              better, and 0.25 is a coin flip. Kickoff times are in your time zone. Updated{' '}
              {new Date(data.generatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.
            </footer>
          </>
        )}
      </main>
      <div className="grain" aria-hidden="true">
        <Noise patternAlpha={10} patternRefreshInterval={600} />
      </div>
    </>
  )
}
