import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react'
import ClickSpark from '@/components/ClickSpark'
import Needles from '@/components/Needles'
import Noise from '@/components/Noise'
import SplitFlapText from '@/components/SplitFlapText'
import Ticker from '@/components/Ticker'
import { BettingView } from '@/betting'
import type { Bet } from '@/betting'
import { Board } from '@/board'
import { BreakdownView } from '@/breakdown'
import { TRACKS, hasTrack, headlines, modelsOf, onTrack } from '@/lib/card'
import type { Data, Track } from '@/lib/card'
import { EASE_OUT, PILL } from '@/lib/motion'
import { useStrip } from '@/lib/narrow'
import { MethodView, Recap, SeasonView, TeamsView } from '@/season'
import { Standings } from '@/standings'
import { AgreementView, CardView, ProfilesView, VsLineView } from '@/views'

// How often an open page looks for a newer results file.
const RECHECK = 5 * 60 * 1000

// The backdrop's dashes: resting, near the pointer, right under it.
const FIELD = { idle: [30, 38, 112], near: [76, 201, 255], hot: [255, 95, 174] } as const satisfies Record<string, [number, number, number]>

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

function Masthead({ count, children }: { count: number; children?: React.ReactNode }) {
  // Pressing the title runs the board again.
  const [run, setRun] = useState(0)
  return (
    <header className="masthead">
      <div className="masthead-title">
        <h1 aria-label="Pick'em Bench" onClick={() => setRun(run + 1)}>
          <SplitFlapText key={`p${run}`} className="flap-pink" text="PICK'EM" textColor="#ff5fae" {...FLAP} />
          <SplitFlapText key={`b${run}`} className="flap-blue" text="BENCH" textColor="#4cc9ff" {...FLAP} />
        </h1>
        <p>
          {count ? `${count} AI models` : 'AI models'} fill out the same NFL card every week. They get schedules, records
          and scores, and never see a betting line. Then the games are played.
        </p>
      </div>
      {children}
    </header>
  )
}

// A panel heading set like the board above it: each letter drops into place on
// a hinge, left to right, landing pink before it cools to white.
function Heading({ id, children }: { id?: string; children: string }) {
  const calm = useReducedMotion()
  if (calm) return <h2 id={id}>{children}</h2>
  let n = 0
  return (
    <h2 id={id} className="flip" aria-label={children}>
      {children.split(' ').map((word, w) => (
        <Fragment key={w}>
          {w > 0 && ' '}
          <span className="flip-word" aria-hidden="true">
            {[...word].map((ch) => (
              <span key={n} style={{ '--n': n++ } as CSSProperties}>
                {ch}
              </span>
            ))}
          </span>
        </Fragment>
      ))}
    </h2>
  )
}

// Field numbers down both sides of the page, where the window is wide enough
// to have sidelines: 10 up to 50 and back down, over and over.
const YARDS = Array.from({ length: 40 }, (_, i) => [10, 20, 30, 40, 50, 40, 30, 20][i % 8])
function Yards() {
  return (
    <div className="yards" aria-hidden="true">
      {['left', 'right'].map((side) => (
        <div key={side} className={side}>
          {YARDS.map((n, i) => (
            <span key={i}>{n}</span>
          ))}
        </div>
      ))}
    </div>
  )
}

// What stands in for the page while the results file is on its way.
function Loading() {
  return (
    <div className="loading" aria-busy="true" aria-label="Loading the card">
      <div className="bone bone-line" />
      <div className="bone bone-sheet" />
      <div className="bone bone-tabs" />
      <div className="bone bone-sheet tall" />
    </div>
  )
}

function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 6000)
    return () => clearTimeout(id)
  }, [text, onDone])
  return (
    <motion.div
      className="toast"
      role="status"
      initial={{ opacity: 0, y: '120%', scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: '60%', scale: 0.98, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', duration: 0.5, bounce: 0.2 }}
    >
      <i className="pulse" aria-hidden="true" />
      {text}
      <button aria-label="Dismiss" onClick={onDone}>
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          <path d="M2 2l8 8M10 2l-8 8" />
        </svg>
      </button>
    </motion.div>
  )
}

const SECTIONS = [
  { id: 'week', label: 'This week' },
  { id: 'season', label: 'Season' },
  { id: 'teams', label: 'Teams' },
  { id: 'method', label: 'How it works' },
  { id: 'betting', label: 'Betting' },
] as const
type SectionId = (typeof SECTIONS)[number]['id']

const VIEWS = [
  { id: 'card', label: 'The card', title: 'The card' },
  { id: 'why', label: 'Game breakdowns', title: 'Why they picked it' },
  { id: 'line', label: 'Models vs the line', title: 'Models vs the line' },
  { id: 'agree', label: 'Who agrees', title: 'Who agrees with whom' },
  { id: 'profiles', label: 'Model profiles', title: 'Model profiles' },
] as const
type ViewId = (typeof VIEWS)[number]['id']

function Tabs<T extends string>({ items, value, onChange, pill, label, small, sticky }: {
  items: readonly { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
  pill: string
  label: string
  small?: boolean
  sticky?: boolean
}) {
  const strip = useRef<HTMLElement>(null)
  useStrip(strip, value)
  return (
    <motion.nav ref={strip} layoutScroll className={`tabs${small ? ' small' : ''}${sticky ? ' sticky' : ''}`} aria-label={label}>
      {items.map((v) => (
        <button key={v.id} aria-pressed={v.id === value} onClick={() => onChange(v.id)}>
          {v.id === value && <motion.span layoutId={pill} className="tab-pill" transition={PILL} />}
          <span>{v.label}</span>
        </button>
      ))}
    </motion.nav>
  )
}

function Weeks({ weeks, value, onChange }: { weeks: number[]; value: number; onChange: (week: number) => void }) {
  const strip = useRef<HTMLDivElement>(null)
  useStrip(strip, value)
  return (
    <div className="weeks" ref={strip}>
      {weeks.map((w) => (
        <button key={w} aria-pressed={w === value} onClick={() => onChange(w)}>
          Week {w}
        </button>
      ))}
    </div>
  )
}

const finalCount = (d: Data) => d.weeks.reduce((n, w) => n + w.games.filter((g) => g.status === 'final').length, 0)

// Sections and views slide in from the side their tab sits on.
const SLIDE = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 28, filter: 'blur(6px)' }),
  center: { opacity: 1, x: 0, filter: 'blur(0px)', transition: { duration: 0.34, ease: EASE_OUT } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -16, filter: 'blur(4px)', transition: { duration: 0.12 } }),
}

export default function App() {
  // `all` is every contestant on both tracks; `data` is the one track on screen.
  const [all, setData] = useState<Data | null>(null)
  const [track, setTrack] = useState<Track>('v1')
  const data = useMemo(() => (all ? onTrack(all, track) : null), [all, track])
  const twoTracks = !!all && hasTrack(all, 'v2')
  const [error, setError] = useState<string | null>(null)
  const [weekNo, setWeekNo] = useState<number | null>(null)
  const [section, setSectionId] = useState<SectionId>('week')
  const [view, setViewId] = useState<ViewId>('card')
  const [gameKey, setGameKey] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
  // Which way the next section or view slides: 1 from the right, -1 from the left.
  const [dir, setDir] = useState(1)
  const setSection = (id: SectionId) => {
    setDir(SECTIONS.findIndex((s) => s.id === id) >= SECTIONS.findIndex((s) => s.id === section) ? 1 : -1)
    setSectionId(id)
  }
  const setView = (id: ViewId) => {
    setDir(VIEWS.findIndex((v) => v.id === id) >= VIEWS.findIndex((v) => v.id === view) ? 1 : -1)
    setViewId(id)
  }
  // The bet log only exists on the local server; anywhere else this stays null
  // and the Betting section never appears.
  const [bets, setBets] = useState<Bet[] | null>(null)
  // Opening a game from far down the card would otherwise land mid-page in the
  // breakdown, so the view tabs come back to the top of the screen.
  const viewTop = useRef<HTMLDivElement>(null)
  const openGame = (key: string, weekOf?: number) => {
    if (weekOf !== undefined) setWeekNo(weekOf)
    setGameKey(key)
    setDir(1)
    setSectionId('week')
    setViewId('why')
    // Wait for the breakdown to be on the page before measuring where it is.
    requestAnimationFrame(() => {
      const top = viewTop.current
      if (!top) return
      const at = top.getBoundingClientRect().top
      if (at < 0 || at > window.innerHeight * 0.6) top.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
  }

  const seen = useRef<Data | null>(null)
  useEffect(() => {
    const load = (again: boolean) =>
      fetch('data.json', { cache: 'no-store' })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then((next: Data) => {
          const last = seen.current
          if (again && last && next.generatedAt === last.generatedAt) return
          if (again && last) {
            const more = finalCount(next) - finalCount(last)
            setToast(more > 0 ? `${more} more ${more === 1 ? 'game is' : 'games are'} final. The card is up to date.` : 'New results are in. The card is up to date.')
          }
          seen.current = next
          setError(null)
          setData(next)
        })
        .catch((err: Error) => {
          // A failed re-check leaves the page as it is.
          if (!again) setError(err.message)
        })
    load(false)
    fetch('private/bets.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => setBets(Array.isArray(b) ? b : null))
      .catch(() => setBets(null))
    const id = setInterval(() => document.visibilityState === 'visible' && load(true), RECHECK)
    const back = () => document.visibilityState === 'visible' && seen.current && Date.now() - new Date(seen.current.generatedAt).getTime() > RECHECK && load(true)
    document.addEventListener('visibilitychange', back)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', back)
    }
  }, [])

  const saveBets = (next: Bet[]) => {
    setBets(next)
    fetch('private/bets.json', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) }).catch(() => {})
  }

  // Panels light up along their edge nearest the pointer. One listener sets two
  // CSS variables on whichever panel the pointer is over.
  const page = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = page.current
    if (!el || !window.matchMedia('(hover: hover)').matches) return
    let frame = 0
    const move = (e: PointerEvent) => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const panel = (e.target as Element).closest?.<HTMLElement>('.sheet, .recap, .board')
        if (!panel) return
        const box = panel.getBoundingClientRect()
        panel.style.setProperty('--mx', `${e.clientX - box.left}px`)
        panel.style.setProperty('--my', `${e.clientY - box.top}px`)
      })
    }
    el.addEventListener('pointermove', move)
    return () => {
      el.removeEventListener('pointermove', move)
      cancelAnimationFrame(frame)
    }
  }, [])

  const week = data ? (data.weeks.find((w) => w.week === weekNo) ?? data.weeks[data.weeks.length - 1]) : undefined
  const ticker = useMemo(() => (data && week ? headlines(data, week) : []), [data, week])
  const models = data ? modelsOf(data).length : 0
  const current = VIEWS.find((v) => v.id === view)!
  const finals = week ? week.games.filter((g) => g.status === 'final').length : 0
  const sections = SECTIONS.filter((s) => s.id !== 'betting' || bets !== null)
  // The backdrop, sparks and grain are decoration; reduced motion turns them off.
  const calm = useReducedMotion()

  return (
    <MotionConfig reducedMotion="user">
      {!calm && (
        <div className="backdrop" aria-hidden="true">
          <div className="aura" />
          <Needles idle={FIELD.idle} near={FIELD.near} hot={FIELD.hot} />
        </div>
      )}
      <ClickSpark sparkColor="#4cc9ff" sparkSize={9} sparkRadius={18} sparkCount={calm ? 0 : 8} duration={420}>
        <main ref={page}>
          {!calm && <Yards />}
          <Masthead count={models}>{data && <Board data={data} onOpen={(w, key) => openGame(key, w)} />}</Masthead>
          {error && (
            <section className="sheet">
              <p className="empty">The results file did not load ({error}). Run "node src/cli.js build" and reload.</p>
            </section>
          )}
          {!data && !error && <Loading />}
          {data && (
            <div className="arrive">
              <Ticker items={ticker} onOpen={(key) => openGame(key)} />
              {twoTracks && (
                <div className="track">
                  <Tabs items={TRACKS} value={track} onChange={setTrack} pill="track-pill" label="Track" small />
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.p key={track} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }} transition={{ duration: 0.24, ease: EASE_OUT }}>
                      {TRACKS.find((t) => t.id === track)!.blurb}
                    </motion.p>
                  </AnimatePresence>
                </div>
              )}
              <Standings data={data} heading={<Heading id="standings-title">Standings</Heading>} />
              <Tabs items={sections} value={section} onChange={setSection} pill="section-pill" label="Sections" sticky />
              <AnimatePresence mode="wait" custom={dir} initial={false}>
                <motion.div key={section} custom={dir} variants={SLIDE} initial="enter" animate="center" exit="exit">
                  {section === 'week' &&
                    (week && !models ? (
                      <section className="sheet">
                        <p className="empty">No picks on this track yet.</p>
                      </section>
                    ) : week && !week.games.some((g) => modelsOf(data).some((c) => g.picks[c.id])) ? (
                      <section className="sheet">
                        <div className="sheet-head">
                          <h2>Week {week.week}</h2>
                          <Weeks weeks={data.weeks.map((w) => w.week)} value={week.week} onChange={setWeekNo} />
                        </div>
                        <p className="empty">This track made no picks in week {week.week}. It started later in the season.</p>
                      </section>
                    ) : week ? (
                      <>
                        <Recap data={data} week={week} />
                        <div ref={viewTop} className="view-top" />
                        <Tabs items={VIEWS} value={view} onChange={setView} pill="view-pill" label="This week's views" small />
                        <section className="sheet" aria-labelledby="view-title">
                          <div className="sheet-head">
                            <Heading key={view} id="view-title">
                              {current.title}
                            </Heading>
                            <p>
                              Week {week.week}: {week.games.length} games, {finals ? `${finals} final` : 'picks locked'}.
                            </p>
                            <Weeks weeks={data.weeks.map((w) => w.week)} value={week.week} onChange={setWeekNo} />
                          </div>
                          <AnimatePresence mode="wait" custom={dir} initial={false}>
                            <motion.div key={`${view}-${week.week}-${track}`} custom={dir} variants={SLIDE} initial="enter" animate="center" exit="exit">
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
                    ))}
                  {section === 'season' && <SeasonView data={data} all={all!} />}
                  {section === 'teams' && <TeamsView data={data} />}
                  {section === 'method' && <MethodView data={data} track={track} />}
                  {section === 'betting' && bets !== null && week && <BettingView data={data} week={week} bets={bets} onSave={saveBets} />}
                </motion.div>
              </AnimatePresence>
              <footer>
                A star is an exact final score. Brier score measures how honest the win probabilities were: lower is
                better, and 0.25 is a coin flip. Kickoff times are in your time zone. Updated{' '}
                {new Date(data.generatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}. Scores and
                betting lines come from ESPN's public scoreboard. Nothing here is betting advice.{' '}
                <a href="https://github.com/JasonCamp311/pickem-bench">Source and credits</a>.
              </footer>
            </div>
          )}
        </main>
      </ClickSpark>
      <AnimatePresence>{toast && <Toast key={toast} text={toast} onDone={clearToast} />}</AnimatePresence>
      {!calm && (
        <div className="grain" aria-hidden="true">
          <Noise patternAlpha={10} patternRefreshInterval={600} />
        </div>
      )}
    </MotionConfig>
  )
}
