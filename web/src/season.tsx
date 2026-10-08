// Season-long pages: the race, the bankroll, calibration, teams and the method.

import { useState } from 'react'
import { motion } from 'motion/react'
import LineChart from '@/components/LineChart'
import { modelsOf, signed } from '@/lib/card'
import { TRACKS } from '@/lib/card'
import type { Data, Track, Week } from '@/lib/card'
import { useNarrow } from '@/lib/narrow'
import { STAKE, allTeams, bankroll, calibration, gradedWeeks, recap, spreadRace, teamGames, trackPairs } from '@/lib/season'
import type { Bin, Paired } from '@/lib/season'

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`

export function Recap({ data, week }: { data: Data; week: Week }) {
  const lines = recap(data, week)
  if (!lines.length) return null
  return (
    <section className="recap" aria-label={`Week ${week.week} recap`}>
      <h2>Week {week.week} in short</h2>
      <ul>
        {lines.map((l, i) => (
          <motion.li key={l} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}>
            {l}
          </motion.li>
        ))}
      </ul>
    </section>
  )
}

function CalibrationPlot({ label, bins }: { label: string; bins: Bin[] }) {
  const S = 190
  const P = 30
  const at = (v: number) => P + ((v - 0.5) / 0.5) * (S - P - 8)
  const yAt = (v: number) => S - P - v * (S - P - 8)
  const seen = bins.filter((b) => b.n > 0)
  return (
    <figure className="calib">
      <figcaption>{label}</figcaption>
      <svg viewBox={`0 0 ${S + 14} ${S}`} width={S + 14} height={S} role="img" aria-label={`Calibration for ${label}`}>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line className="chart-grid" x1={P} x2={S - 8} y1={yAt(v)} y2={yAt(v)} />
            <text className="chart-tick" x={P - 6} y={yAt(v) + 4} textAnchor="end">
              {v * 100}
            </text>
          </g>
        ))}
        {[0.5, 0.75, 1].map((v) => (
          <text key={v} className="chart-tick" x={at(v)} y={S - 10} textAnchor="middle">
            {v * 100}
          </text>
        ))}
        {/* Perfect calibration: a pick called at 70% wins 70% of the time. */}
        <line className="chart-zero" x1={at(0.5)} y1={yAt(0.5)} x2={at(1)} y2={yAt(1)} />
        {seen.map((b) => (
          <g key={b.from}>
            <title>{`Said ${Math.round((b.stated / b.n) * 100)}% on ${b.n} picks, won ${Math.round((b.wins / b.n) * 100)}%`}</title>
            <motion.circle
              className="calib-dot"
              cx={at(b.stated / b.n)}
              cy={yAt(b.wins / b.n)}
              initial={{ r: 0 }}
              animate={{ r: Math.min(11, 4 + Math.sqrt(b.n)) }}
            />
          </g>
        ))}
      </svg>
      <p>{seen.length ? seen.map((b) => `${Math.round(b.from * 100)}s: ${Math.round((b.wins / b.n) * 100)}% of ${b.n}`).join(', ') : 'No graded picks yet'}</p>
    </figure>
  )
}

// One paired statistic: both averages, then whether the gap is more than noise.
// Lower is better for both margin miss and Brier score.
function Change({ s, digits }: { s: Paired['miss']; digits: number }) {
  const clear = Math.abs(s.diff) >= 2 * s.se
  return (
    <td className={`num ${clear ? (s.diff < 0 ? 'W' : 'L') : ''}`}>
      {s.a.toFixed(digits)} to {s.b.toFixed(digits)}
      <small>{clear ? `${Math.abs(s.diff).toFixed(digits)} ${s.diff < 0 ? 'better' : 'worse'}` : 'too close to call'}</small>
    </td>
  )
}

function PairTable({ rows, from, to }: { rows: Paired[]; from: string; to: string }) {
  return (
    <div className="scroll">
      <table className="pair-table">
        <thead>
          <tr>
            <th>Model</th>
            <th className="num">
              Margin miss
              <small>
                {from} to {to}
              </small>
            </th>
            <th className="num">
              Brier score
              <small>
                {from} to {to}
              </small>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">
                {r.label}
                <small>{r.n} games</small>
              </th>
              <Change s={r.miss} digits={1} />
              <Change s={r.brier} digits={3} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// The reason there are two tracks: the same model on the same games, with and
// without the extra data, and each model against the ratings it was handed.
function TrackCompare({ all }: { all: Data }) {
  const pairs = trackPairs(all)
  if (!pairs.tracks.length) return null
  return (
    <section className="sheet">
      <div className="sheet-head">
        <h2>Does the extra data help?</h2>
        <p>Each model against itself on the same games, graded both ways. Lower is better in both columns.</p>
      </div>
      <PairTable rows={pairs.tracks} from="scores only" to="with ratings" />
      {pairs.math.length > 0 && (
        <>
          <p className="lede">And against the ratings on their own: does the model improve on the numbers it was given?</p>
          <PairTable rows={pairs.math} from="ratings alone" to="model" />
        </>
      )}
      <p className="key">
        Margin miss is how far the predicted margin was from the real one, in points. A change counts as better or worse
        only when it is more than twice its standard error across the games both versions picked; anything smaller could
        be luck.
      </p>
    </section>
  )
}

export function SeasonView({ data, all }: { data: Data; all: Data }) {
  const weeks = gradedWeeks(data)
  const race = spreadRace(data)
  const cash = bankroll(data)
  const leader = [...race].filter((s) => s.style === 'solid').sort((a, b) => b.values[b.values.length - 1] - a.values[a.values.length - 1])[0]
  const [picked, setPicked] = useState<string | null>(null)
  const selected = picked ?? leader?.id ?? ''
  const labels = ['Start', ...data.weeks.map((w) => `Week ${w.week}`)]
  const games = weeks.reduce((n, w) => n + w.games.filter((g) => g.status === 'final').length, 0)

  if (!weeks.length || !race.length) {
    return (
      <section className="sheet">
        <div className="sheet-head">
          <h2>Season</h2>
        </div>
        <p className="empty">The season charts start once the first game is graded. Until then, the picks are under "This week".</p>
      </section>
    )
  }
  return (
    <>
      <TrackCompare all={all} />
      <section className="sheet">
        <div className="sheet-head">
          <h2>The race against the spread</h2>
          <p>Wins minus losses, running total. Above zero is a winning record.</p>
        </div>
        <LineChart series={race} labels={labels} format={(n) => signed(n)} selected={selected} onSelect={setPicked} />
      </section>
      <section className="sheet">
        <div className="sheet-head">
          <h2>If each one bet ${STAKE} a game</h2>
          <p>
            Every spread pick at the standard price, where a win pays $91 and a loss costs $100. {games} games so far.
          </p>
        </div>
        <LineChart series={cash} labels={labels} format={money} selected={selected} onSelect={setPicked} />
        <p className="key">A model needs to win more than 52.4% of its spread picks to finish above zero here. This is a paper exercise, not betting advice.</p>
      </section>
      <section className="sheet">
        <div className="sheet-head">
          <h2>Do they mean it?</h2>
          <p>Stated confidence across the bottom, how often those picks actually won up the side.</p>
        </div>
        <div className="calibs">
          {modelsOf(data).map((c) => (
            <CalibrationPlot key={c.id} label={c.label} bins={calibration(data, c.id)} />
          ))}
        </div>
        <p className="key">Dots on the diagonal are honest. Below it, the model was more confident than it had any right to be. Bigger dots hold more picks.</p>
      </section>
    </>
  )
}

export function TeamsView({ data }: { data: Data }) {
  const teams = allTeams(data)
  const [team, setTeam] = useState(teams[0])
  const models = modelsOf(data)
  const rows = teamGames(data, team)
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const narrow = useNarrow()
  const result = (actual: number | null) => (actual === null ? 'not played' : `${actual > 0 ? 'Won' : actual < 0 ? 'Lost' : 'Tied'} by ${Math.abs(actual)}`)
  const miss = (id: string) => {
    const m = mean(rows.filter((r) => r.actual !== null && r.predicted[id] !== undefined).map((r) => r.predicted[id] - r.actual!))
    return m === null ? '' : signed(Math.round(m * 10) / 10)
  }
  // On a phone the team comes from a menu and each game lists the models under it.
  if (narrow) {
    return (
      <section className="sheet">
        <div className="sheet-head">
          <h2>Team by team</h2>
          <p>Each model's predicted margin for one team, game by game. Plus means it had the team winning.</p>
        </div>
        <div className="team-games">
          <label className="team-pick">
            Team
            <select value={team} onChange={(e) => setTeam(e.target.value)}>
              {teams.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          {rows.map((r) => (
            <article key={`${r.week}-${r.game.key}`}>
              <h3>
                Week {r.week} {r.home ? 'vs' : 'at'} {r.opponent}
                <small>{result(r.actual)}</small>
              </h3>
              <dl>
                {models.map((c) => {
                  const p = r.predicted[c.id]
                  if (p === undefined) return null
                  const right = r.actual !== null && Math.sign(p) === Math.sign(r.actual)
                  return (
                    <div key={c.id} className={r.actual === null ? undefined : right ? 'W' : 'L'}>
                      <dt>{c.label}</dt>
                      <dd>{signed(p)}</dd>
                    </div>
                  )
                })}
              </dl>
            </article>
          ))}
          {models.some((c) => miss(c.id)) && (
            <article className="house">
              <h3>
                Average miss
                <small>plus means too high on {team}</small>
              </h3>
              <dl>
                {models.map((c) => (
                  <div key={c.id}>
                    <dt>{c.label}</dt>
                    <dd>{miss(c.id)}</dd>
                  </div>
                ))}
              </dl>
            </article>
          )}
        </div>
      </section>
    )
  }
  return (
    <section className="sheet">
      <div className="sheet-head">
        <h2>Team by team</h2>
        <p>Each model's predicted margin for one team, game by game. Plus means it had the team winning.</p>
      </div>
      <div className="why">
        <div className="game-chips" role="group" aria-label="Choose a team">
          {teams.map((t) => (
            <button key={t} aria-pressed={t === team} onClick={() => setTeam(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="scroll">
        <table className="card-table team-table">
          <thead>
            <tr>
              <th>Game</th>
              <th className="num">Result</th>
              {models.map((c) => (
                <th key={c.id} className="num">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.week}-${r.game.key}`}>
                <th scope="row">
                  Week {r.week} {r.home ? 'vs' : 'at'} {r.opponent}
                </th>
                <td className="num">{result(r.actual)}</td>
                {models.map((c) => {
                  const p = r.predicted[c.id]
                  const right = r.actual !== null && p !== undefined && Math.sign(p) === Math.sign(r.actual)
                  return (
                    <td key={c.id} className={`num ${r.actual === null || p === undefined ? '' : right ? 'W' : 'L'}`}>
                      {p === undefined ? '' : signed(p)}
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr className="house">
              <th scope="row">
                Average miss
                <small>plus means too high on {team}</small>
              </th>
              <td />
              {models.map((c) => (
                <td key={c.id} className="num">
                  {miss(c.id)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function MethodView({ data, track }: { data: Data; track: Track }) {
  const checker = [...data.weeks].reverse().find((w) => w.checker)?.checker
  const v2 = track === 'v2' ? data.methodV2 : null
  const prompt = v2 ?? data.method
  return (
    <section className="sheet">
      <div className="sheet-head">
        <h2>How it works</h2>
      </div>
      <div className="method">
        <h3>The setup</h3>
        <p>
          Every week each model gets the same prompt: the schedule and, for every team, this season's record, home and
          road splits, points scored and allowed, rest days and results. There are no betting lines in it, and the
          models have no tools or web access. They do have whatever they remember from training, so this measures
          prediction from the same inputs, not prediction from nothing.
        </p>
        {v2 && (
          <>
            <h3>What this track adds</h3>
            <p>
              The "{TRACKS[1].label}" track runs the same models on the same games with a richer sheet. Code turns
              every final score since 2020 into two ratings per team: an Elo rating that moves with each result and
              its margin, and an offense and defense rating fitted by ridge regression, which adjusts for the opponents
              a team has played and starts each season from part of last season's rating. The two are averaged into a
              predicted score and a win probability for every game, and the models are told to start from that and move
              off it only for a reason, such as the injury report they are also given.
            </p>
            <p>
              "Ratings only" is that predicted score with no model at all. If a model cannot beat it on the same
              games, the model added nothing.
            </p>
            {v2.params && (
              <p>
                The settings were fitted on the 2021 to 2024 seasons, checked on 2025 and then frozen: home edge{' '}
                {v2.params.ridge.home} points, Elo K {v2.params.elo.k} with {v2.params.elo.carry * 100}% carried between
                seasons, ridge strength {v2.params.ridge.lambda} with {v2.params.ridge.carry * 100}% carried, and a
                margin spread of {v2.params.sigma} points for turning a margin into a probability.
              </p>
            )}
          </>
        )}
        <h3>Locking</h3>
        <p>
          Each model's reply is checked, saved once and fingerprinted. A pick file is never rewritten, and only picks
          saved before kickoff are graded. If a saved file stops matching its fingerprint, the site flags it.
        </p>
        <h3>Grading</h3>
        <p>
          Models are asked for a final score and a win probability. Everything else comes from that score: the
          straight-up winner, the side of the spread the predicted margin lands on, and over or under on the total.
          Those are graded against the closing line. A lock of the week, an upset of the week and a first-half leader
          are asked for directly. The Brier score measures how honest the win probabilities were.
        </p>
        <h3>The yardsticks</h3>
        <p>
          Two baselines need no model: always take the home team, and always take the betting favorite. The model
          consensus averages the models' predicted scores and is graded like one more contestant.
        </p>
        {checker && (
          <>
            <h3>Fact checks</h3>
            <p>
              A separate model ({checker}) compares each stated reason with the data sheet and flags claims the sheet
              contradicts. It is a second opinion and can be wrong; flags are marked on the game breakdowns.
            </p>
          </>
        )}
        {prompt && (
          <>
            <h3>The prompt, word for word</h3>
            <pre>{prompt.system}</pre>
            <h3>One game as the models see it</h3>
            <pre>{prompt.sample}</pre>
          </>
        )}
      </div>
    </section>
  )
}
