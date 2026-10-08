import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import ClickSpark from '@/components/ClickSpark'
import CountUp from '@/components/CountUp'
import DecryptedText from '@/components/DecryptedText'
import DotGrid from '@/components/DotGrid'
import Noise from '@/components/Noise'
import ScrollVelocity from '@/components/ScrollVelocity'
import SplitFlapText from '@/components/SplitFlapText'
import { headlines, kick, kindNote, modelsOf, pct } from '@/lib/card'
import type { Contestant, Data, Totals } from '@/lib/card'
import { BreakdownView } from '@/breakdown'
import { AgreementView, CardView, ProfilesView, VsLineView } from '@/views'

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

function Heading({ id, children }: { id?: string; children: string }) {
  return (
    <h2 id={id}>
      <DecryptedText text={children} animateOn="view" sequential speed={35} encryptedClassName="scrambled" />
    </h2>
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
        <Heading id="standings-title">Standings</Heading>
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
                <th className="num">Over/under</th>
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
                    <td className="num">
                      {t.ouN > 0 && (
                        <>
                          <Tally r={t.ou} />
                          <small>{pct(t.ou[0], t.ou[1])}</small>
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

const VIEWS = [
  { id: 'card', label: 'The card', title: 'The card' },
  { id: 'why', label: 'Game breakdowns', title: 'Why they picked it' },
  { id: 'line', label: 'Models vs the line', title: 'Models vs the line' },
  { id: 'agree', label: 'Who agrees', title: 'Who agrees with whom' },
  { id: 'profiles', label: 'Model profiles', title: 'Model profiles' },
] as const
type ViewId = (typeof VIEWS)[number]['id']

export default function App() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [weekNo, setWeekNo] = useState<number | null>(null)
  const [view, setView] = useState<ViewId>('card')
  const [gameKey, setGameKey] = useState<string | null>(null)
  const openGame = (key: string) => {
    setGameKey(key)
    setView('why')
  }

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
  const models = data ? modelsOf(data).length : 0
  const current = VIEWS.find((v) => v.id === view)!
  const finals = week ? week.games.filter((g) => g.status === 'final').length : 0

  return (
    <MotionConfig reducedMotion="user">
      <div className="backdrop" aria-hidden="true">
        <DotGrid dotSize={3} gap={28} baseColor="#1a2060" activeColor="#ff5fae" proximity={130} shockRadius={220} shockStrength={4} />
      </div>
      <ClickSpark sparkColor="#4cc9ff" sparkSize={9} sparkRadius={18} sparkCount={8} duration={420}>
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
                <>
                  <nav className="tabs" aria-label="Views">
                    {VIEWS.map((v) => (
                      <button key={v.id} aria-pressed={v.id === view} onClick={() => setView(v.id)}>
                        {v.id === view && (
                          <motion.span
                            layoutId="tab-pill"
                            className="tab-pill"
                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                          />
                        )}
                        <span>{v.label}</span>
                      </button>
                    ))}
                  </nav>
                  <section className="sheet" aria-labelledby="view-title">
                    <div className="sheet-head">
                      <Heading key={view} id="view-title">
                        {current.title}
                      </Heading>
                      <p>
                        Week {week.week}: {week.games.length} games, {finals ? `${finals} final` : 'picks locked'}.
                      </p>
                      <div className="weeks">
                        {data.weeks.map((w) => (
                          <button key={w.week} aria-pressed={w.week === week.week} onClick={() => setWeekNo(w.week)}>
                            Week {w.week}
                          </button>
                        ))}
                      </div>
                    </div>
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={`${view}-${week.week}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.22 }}
                      >
                        {view === 'card' && <CardView data={data} week={week} onOpen={openGame} />}
                        {view === 'why' && <BreakdownView data={data} week={week} gameKey={gameKey} onGame={setGameKey} />}
                        {view === 'line' && <VsLineView data={data} week={week} />}
                        {view === 'agree' && <AgreementView data={data} week={week} />}
                        {view === 'profiles' && <ProfilesView data={data} week={week} />}
                      </motion.div>
                    </AnimatePresence>
                  </section>
                </>
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
      </ClickSpark>
      <div className="grain" aria-hidden="true">
        <Noise patternAlpha={10} patternRefreshInterval={600} />
      </div>
    </MotionConfig>
  )
}
