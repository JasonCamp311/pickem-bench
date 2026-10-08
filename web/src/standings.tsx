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
  short?: string
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

function Tally({ r }: { r: number[] }) {
  if (!played(r)) return null
  return (
    <>
      <Roll value={r[0]} />-<Roll value={r[1]} />
      {r[2] ? `-${r[2]}` : ''}
      <small>{pct(r[0], r[1])}</small>
    </>
  )
}

function columns(rows: Row[]): Column[] {
  const any = (f: (t: Totals) => number[]) => rows.some((r) => played(f(r.t)))
  const tally = (id: string, label: string, get: (t: Totals) => number[], short?: string): Column => ({
    id,
    label,
    short,
    rank: (r) => rate(get(r.t)),
    cell: (r) => <Tally r={get(r.t)} />,
    text: (r) => (played(get(r.t)) ? `${record(get(r.t))} (${pct(get(r.t)[0], get(r.t)[1])})` : ''),
  })
  const brier = (r: Row) => (r.t.brierSum / r.t.n).toFixed(3)
  const miss = (r: Row) => (r.c.kind === 'baseline' ? '' : (r.t.marginErrorSum / r.t.n).toFixed(1))
  return [
    tally('su', 'Straight up', (t) => t.su),
    tally('ats', 'Against the spread', (t) => t.ats, 'Spread'),
    tally('ou', 'Over/under', (t) => t.ou),
    ...[
      tally('fh', 'First half', (t) => t.fh),
      tally('lock', 'Locks', (t) => t.lock),
      tally('upset', 'Upset calls', (t) => t.upset),
    ].filter((col) => any((t) => t[col.id as 'fh' | 'lock' | 'upset'])),
    {
      id: 'exact',
      label: 'Exact finals',
      rank: (r) => (synthetic(r.c) ? null : r.t.exact),
      cell: (r) => (synthetic(r.c) ? '' : <Roll value={r.t.exact} />),
      text: (r) => (synthetic(r.c) ? '' : String(r.t.exact)),
    },
    { id: 'brier', label: 'Brier score', low: true, rank: (r) => r.t.brierSum / r.t.n, cell: (r) => <Roll value={brier(r)} />, text: brier },
    {
      id: 'miss',
      label: 'Average margin miss',
      low: true,
      rank: (r) => (r.c.kind === 'baseline' ? null : r.t.marginErrorSum / r.t.n),
      cell: (r) => (miss(r) ? <Roll value={miss(r)} /> : ''),
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

  const head = (x: Column, label: string) => (
    <button className="sort" aria-pressed={x.id === col.id} onClick={() => setBy(x.id)} title={`Rank by ${x.label.toLowerCase()}`}>
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
            <div className="stand-row stand-head" role="row">
              <span role="columnheader" />
              <span role="columnheader">Contestant</span>
              {cols.map((x) => (
                <span key={x.id} role="columnheader" className="num" aria-sort={x.id === col.id ? (x.low ? 'ascending' : 'descending') : undefined}>
                  {head(x, x.label)}
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
                  <Roll value={i + 1} />
                </span>
                <span role="rowheader" className="stand-who">
                  {row.c.label}
                  {kindNote[row.c.kind] && <small>{kindNote[row.c.kind]}</small>}
                </span>
                {cols.map((x) => (
                  <span key={x.id} role="cell" className={`num${x.id === col.id ? ' by' : ''}`}>
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
