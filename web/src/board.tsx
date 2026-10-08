// The readout beside the title: where the week stands, the next kickoff with a
// running clock, and who leads once games are graded.

import { useEffect, useState } from 'react'
import Roll from '@/components/Roll'
import { Matchup } from '@/components/Team'
import { kick, modelsOf } from '@/lib/card'
import type { Data } from '@/lib/card'

const two = (n: number) => String(n).padStart(2, '0')

function useNow(every: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), every)
    return () => clearInterval(id)
  }, [every])
  return now
}

function Clock({ until }: { until: number }) {
  const now = useNow(1000)
  const left = Math.max(0, Math.floor((until - now) / 1000))
  const days = Math.floor(left / 86400)
  const parts = [Math.floor((left % 86400) / 3600), Math.floor((left % 3600) / 60), left % 60]
  return (
    <span className="board-clock" role="timer" aria-label={`${days} days, ${parts[0]} hours, ${parts[1]} minutes`}>
      {days > 0 && (
        <>
          <Roll value={days} quick />
          <i className="days">d</i>
        </>
      )}
      <Roll value={two(parts[0])} quick />
      <i>:</i>
      <Roll value={two(parts[1])} quick />
      <i>:</i>
      <Roll value={two(parts[2])} quick />
    </span>
  )
}

export function Board({ data, onOpen }: { data: Data; onOpen: (week: number, game: string) => void }) {
  const week = data.weeks[data.weeks.length - 1]
  // Re-read the clock once a minute so a kickoff passing changes the readout.
  const now = useNow(60000)
  if (!week) return null
  const finals = week.games.filter((g) => g.status === 'final').length
  const waiting = week.games.filter((g) => g.status !== 'final').sort((a, b) => a.kickoff.localeCompare(b.kickoff))
  const next = waiting.find((g) => new Date(g.kickoff).getTime() > now)
  const pending = waiting.filter((g) => new Date(g.kickoff).getTime() <= now).length
  const leader = modelsOf(data)
    .map((c) => ({ c, t: data.totals[c.id] }))
    .filter((r) => r.t && r.t.ats[0] + r.t.ats[1] > 0)
    .sort((a, b) => b.t.ats[0] / (b.t.ats[0] + b.t.ats[1]) - a.t.ats[0] / (a.t.ats[0] + a.t.ats[1]) || b.t.su[0] - a.t.su[0])[0]
  const state = finals === week.games.length ? 'all games final' : finals ? `${finals} of ${week.games.length} final` : 'picks locked'

  return (
    <aside className="board" aria-label="Where the week stands">
      <p className="board-live">
        <i className="pulse" aria-hidden="true" />
        Week {week.week}
        <span>{state}</span>
      </p>
      <dl>
        {next && (
          <>
            <div>
              <dt>Next kickoff</dt>
              <dd>
                <button className="match" onClick={() => onOpen(week.week, next.key)}>
                  <Matchup away={next.away} home={next.home} />
                </button>
                <small>{kick(next.kickoff)}</small>
              </dd>
            </div>
            <div>
              <dt>Kicks off in</dt>
              <dd>
                <Clock until={new Date(next.kickoff).getTime()} />
              </dd>
            </div>
          </>
        )}
        {pending > 0 && (
          <div>
            <dt>Awaiting results</dt>
            <dd>
              <Roll value={pending} /> {pending === 1 ? 'game' : 'games'}
            </dd>
          </div>
        )}
        {leader && (
          <div>
            <dt>Leading against the spread</dt>
            <dd>
              {leader.c.label}
              <small>
                {leader.t.ats[0]}-{leader.t.ats[1]}
              </small>
            </dd>
          </div>
        )}
      </dl>
    </aside>
  )
}
