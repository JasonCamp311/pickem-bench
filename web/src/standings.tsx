// The standings: every contestant's records, ranked. Pressing a column heading
// re-ranks by that column and the rows slide to their new places.

import { useState } from 'react'
import { motion } from 'motion/react'
import type { CSSProperties } from 'react'
import Roll from '@/components/Roll'
import { derived, kick, kindNote, pct } from '@/lib/card'
import type { Contestant, Data, Totals } from '@/lib/card'
import { REORDER } from '@/lib/motion'
import { useNarrow } from '@/lib/narrow'

type Row = { c: Contestant; t: Totals }
interface Column {
  id: string
  label: string
  // The heading the wide table shows; the full label rides along as a tooltip.
  short: string
  // Records first, then how close the numbers came.
  group: 'rec' | 'acc'
  // What a row is ranked by in this column; null sorts last. Bigger is better
  // unless `low` is set.
  rank: (r: Row) => number | null
  low?: boolean
  cell: (r: Row) => React.ReactNode
  text: (r: Row) => string
}

// How the line under the heading names the column the table is ranked by.
const RANKED: Record<string, string> = {
  su: 'straight-up record',
  ats: 'record against the spread',
  ou: 'over/under record',
  fh: 'first-half record',
  lock: 'record on locks of the week',
  upset: 'record on upset calls',
  exact: 'exact finals',
  brier: 'Brier score',
  miss: 'average margin miss',
}

const played = (r: number[]) => r[0] + r[1] + (r[2] ?? 0) > 0
const record = (r: number[]) => `${r[0]}-${r[1]}${r[2] ? `-${r[2]}` : ''}`
const rate = (r: number[]) => (r[0] + r[1] ? r[0] / (r[0] + r[1]) : null)
const synthetic = (c: Contestant) => c.kind === 'baseline' || derived(c)

const Blank = () => <span className="blank">–</span>

// A record, with its win rate as a short meter under it. Under .500 runs pink.
function Tally({ r }: { r: number[] }) {
  const p = rate(r)
  if (!played(r)) return <Blank />
  return (
    <span className="tally">
      <span className="tally-rec">
        <Roll value={r[0]} />-<Roll value={r[1]} />
        {r[2] ? `-${r[2]}` : ''}
      </span>
      <span className={`tally-meter${p !== null && p < 0.5 ? ' low' : ''}`}>
        <i style={{ '--p': p ?? 0 } as CSSProperties} />
        {pct(r[0], r[1])}
      </span>
    </span>
  )
}

function columns(rows: Row[]): Column[] {
  const any = (f: (t: Totals) => number[]) => rows.some((r) => played(f(r.t)))
  const tally = (id: string, label: string, short: string, get: (t: Totals) => number[]): Column => ({
    id,
    label,
    short,
    group: 'rec',
    rank: (r) => rate(get(r.t)),
    cell: (r) => <Tally r={get(r.t)} />,
    text: (r) => (played(get(r.t)) ? `${record(get(r.t))} (${pct(get(r.t)[0], get(r.t)[1])})` : ''),
  })
  const brier = (r: Row) => (r.t.brierSum / r.t.n).toFixed(3)
  const miss = (r: Row) => (r.c.kind === 'baseline' ? '' : (r.t.marginErrorSum / r.t.n).toFixed(1))
  return [
    tally('su', 'Straight up', 'SU', (t) => t.su),
    tally('ats', 'Against the spread', 'ATS', (t) => t.ats),
    tally('ou', 'Over/under', 'O/U', (t) => t.ou),
    ...[
      tally('fh', 'First half', '1st half', (t) => t.fh),
      tally('lock', 'Locks', 'Locks', (t) => t.lock),
      tally('upset', 'Upset calls', 'Upsets', (t) => t.upset),
    ].filter((col) => any((t) => t[col.id as 'fh' | 'lock' | 'upset'])),
    {
      id: 'exact',
      label: 'Exact finals',
      short: 'Exact',
      group: 'acc',
      rank: (r) => (synthetic(r.c) ? null : r.t.exact),
      cell: (r) => (synthetic(r.c) ? <Blank /> : <span className="metric">{r.t.exact > 0 && <b className="star">★</b>}<Roll value={r.t.exact} /></span>),
      text: (r) => (synthetic(r.c) ? '' : String(r.t.exact)),
    },
    {
      id: 'brier',
      label: 'Brier score',
      short: 'Brier',
      group: 'acc',
      low: true,
      rank: (r) => r.t.brierSum / r.t.n,
      // Worse than a coin flip (0.25) runs pink.
      cell: (r) => <span className={`metric${r.t.brierSum / r.t.n > 0.25 ? ' low' : ''}`}><Roll value={brier(r)} /></span>,
      text: brier,
    },
    {
      id: 'miss',
      label: 'Average margin miss',
      short: 'Miss',
      group: 'acc',
      low: true,
      rank: (r) => (r.c.kind === 'baseline' ? null : r.t.marginErrorSum / r.t.n),
      cell: (r) => (miss(r) ? <span className="metric"><Roll value={miss(r)} /><small>pts</small></span> : <Blank />),
      text: miss,
    },
  ]
}

function Arrow() {
  return (
    <svg className="sort-arrow" viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
      <path d="M1.5 3.5L5 7l3.5-3.5" />
    </svg>
  )
}

export function Standings({ data, heading }: { data: Data; heading: React.ReactNode }) {
  const narrow = useNarrow()
  const [by, setBy] = useState('ats')
  const rows: Row[] = data.contestants
    .map((c) => ({ c, t: data.totals[c.id] }))
    .filter((r): r is Row => !!r.t && r.t.n > 0)
  const cols = columns(rows)
  const col = cols.find((x) => x.id === by) ?? cols[1]
  const order = (r: Row) => {
    const v = col.rank(r)
    return v === null ? -Infinity : col.low ? -v : v
  }
  rows.sort((a, b) => order(b) - order(a) || b.t.su[0] - a.t.su[0])
  const next = data.weeks
    .flatMap((w) => w.games)
    .filter((g) => g.status === 'scheduled')
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0]

  // The marked leader is the top model; a baseline or an average can outrank it.
  const lead = rows.find((r) => !synthetic(r.c))?.c.id

  const records = cols.filter((x) => x.group === 'rec').length
  const split = (x: Column) => (x.id === cols[records]?.id ? ' split' : '')

  const head = (x: Column, label: string) => (
    <button className="sort" aria-label={x.label} aria-pressed={x.id === col.id} onClick={() => setBy(x.id)} title={`${x.label}: rank by this`}>
      {label}
      <Arrow />
    </button>
  )

  return (
    <section className="sheet standings" aria-labelledby="standings-title">
      <div className="sheet-head">
        {heading}
        {rows.length > 0 && (
          <p>
            Ranked by {RANKED[col.id]}
            {col.low ? ', lowest first' : ''}.{narrow ? ' Tap a row for the rest.' : ''}
          </p>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="empty">
          Nothing graded yet.{next ? ` First up: ${next.away} at ${next.home}, ${kick(next.kickoff)}.` : ''}
        </p>
      ) : narrow ? (
        <ol className="stand-list">
          <li className="stand-cols">
            <span />
            <span>Contestant</span>
            {head(cols[1], 'Spread')}
            {head(cols[0], 'Straight up')}
          </li>
          {rows.map(({ c, t }, i) => {
            const more = cols
              .filter((x) => x.id !== 'su' && x.id !== 'ats')
              .map((x) => ({ label: x.label, value: x.text({ c, t }) }))
              .filter((m) => m.value)
            return (
              <motion.li key={c.id} layout="position" transition={REORDER} className={synthetic(c) ? 'house' : undefined}>
                <details>
                  <summary>
                    <span className="stand-rank">{i + 1}</span>
                    <span className="stand-name">
                      {c.label}
                      {kindNote[c.kind] && <small>{kindNote[c.kind]}</small>}
                    </span>
                    <span className="stand-rec">
                      {played(t.ats) ? record(t.ats) : ''}
                      <small>{pct(t.ats[0], t.ats[1])}</small>
                    </span>
                    <span className="stand-rec">
                      {record(t.su)}
                      <small>{pct(t.su[0], t.su[1])}</small>
                    </span>
                  </summary>
                  <dl>
                    {more.map((m) => (
                      <div key={m.label}>
                        <dt>{m.label}</dt>
                        <dd>{m.value}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </motion.li>
            )
          })}
        </ol>
      ) : (
        <div className="scroll">
          <div className="stand-grid" role="table" aria-label="Standings" style={{ '--cols': cols.length } as CSSProperties}>
            <div className="stand-groups" aria-hidden="true">
              <span style={{ gridColumn: `3 / span ${records}` }}>Records</span>
              <span className="split" style={{ gridColumn: `${3 + records} / -1` }}>
                Accuracy
              </span>
            </div>
            <div className="stand-row stand-head" role="row">
              <span role="columnheader" />
              <span role="columnheader">Contestant</span>
              {cols.map((x) => (
                <span key={x.id} role="columnheader" className={`num${split(x)}`} aria-sort={x.id === col.id ? (x.low ? 'ascending' : 'descending') : undefined}>
                  {head(x, x.short)}
                </span>
              ))}
            </div>
            {rows.map((row, i) => (
              <motion.div
                key={row.c.id}
                layout="position"
                transition={REORDER}
                role="row"
                className={`stand-row${synthetic(row.c) ? ' house' : ''}${row.c.id === lead ? ' lead' : ''}`}
                style={{ '--i': i } as CSSProperties}
              >
                <span role="cell" className="stand-rank">
                  <b className="rank-tile">
                    <Roll value={i + 1} />
                  </b>
                </span>
                <span role="rowheader" className="stand-who">
                  {row.c.label}
                  {kindNote[row.c.kind] && <small>{kindNote[row.c.kind]}</small>}
                </span>
                {cols.map((x) => (
                  <span key={x.id} role="cell" className={`num${x.id === col.id ? ' by' : ''}${split(x)}`}>
                    {x.cell(row)}
                  </span>
                ))}
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
