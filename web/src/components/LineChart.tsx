// A small line chart for running totals. One series is highlighted at a time;
// the rest stay muted for context, so nine lines never need nine colors.

import { useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import type { Series } from '@/lib/season'

interface Props {
  series: Series[]
  labels: string[]
  format: (n: number) => string
  selected: string
  onSelect: (id: string) => void
}

const PAD = { top: 14, right: 16, bottom: 30, left: 56 }
const HEIGHT = 320
const DASH = { solid: undefined, dashed: '6 5', dotted: '2 5' }

function niceTicks(lo: number, hi: number) {
  const span = hi - lo || 1
  const rough = span / 4
  const pow = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? rough
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 100) / 100)
  return out
}

export default function LineChart({ series, labels, format, selected, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  const [hover, setHover] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth || 720)
    measure()
    const watcher = new ResizeObserver(measure)
    watcher.observe(el)
    return () => watcher.disconnect()
  }, [])

  const all = series.flatMap((s) => s.values)
  const lo = Math.min(0, ...all)
  const hi = Math.max(0, ...all)
  const pad = (hi - lo || 1) * 0.08
  const y0 = lo - pad
  const y1 = hi + pad
  const innerW = Math.max(60, width - PAD.left - PAD.right)
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (labels.length > 1 ? (i / (labels.length - 1)) * innerW : innerW / 2)
  const y = (v: number) => PAD.top + (1 - (v - y0) / (y1 - y0)) * innerH
  const path = (s: Series) => s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const ordered = [...series].sort((a, b) => (a.id === selected ? 1 : 0) - (b.id === selected ? 1 : 0))
  const chosen = series.find((s) => s.id === selected)
  const last = labels.length - 1

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const at = ((e.clientX - rect.left - PAD.left) / innerW) * last
    setHover(Math.max(0, Math.min(last, Math.round(at))))
  }

  return (
    <div className="chart">
      <div className="chart-legend" role="group" aria-label="Highlight a contestant">
        {[...series]
          .sort((a, b) => b.values[last] - a.values[last])
          .map((s) => (
            <button key={s.id} aria-pressed={s.id === selected} onClick={() => onSelect(s.id)}>
              <svg width="22" height="8" aria-hidden="true">
                <line x1="1" y1="4" x2="21" y2="4" strokeDasharray={DASH[s.style]} />
              </svg>
              {s.label}
              <b>{format(s.values[last])}</b>
            </button>
          ))}
      </div>
      <div className="chart-box" ref={box}>
        <svg width={width} height={HEIGHT} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Line chart; the table of standings holds the same totals">
          {niceTicks(y0, y1).map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'chart-zero' : 'chart-grid'} x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="chart-tick" x={PAD.left - 8} y={y(t) + 4} textAnchor="end">
                {format(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) => (
            <text key={l} className="chart-tick" x={x(i)} y={HEIGHT - 8} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}>
              {l}
            </text>
          ))}
          {hover !== null && <line className="chart-cross" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={HEIGHT - PAD.bottom} />}
          {ordered.map((s) => (
            <motion.path
              key={s.id}
              d={path(s)}
              className={`chart-line${s.id === selected ? ' on' : ''}`}
              strokeDasharray={DASH[s.style]}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
            />
          ))}
          {chosen?.values.map((v, i) => <circle key={i} className="chart-point" cx={x(i)} cy={y(v)} r={4} />)}
        </svg>
        {hover !== null && (
          <div className="chart-tip" style={hover > last / 2 ? { right: width - x(hover) + 12 } : { left: x(hover) + 12 }}>
            <strong>{labels[hover]}</strong>
            {[...series]
              .sort((a, b) => b.values[hover] - a.values[hover])
              .map((s) => (
                <div key={s.id} className={s.id === selected ? 'on' : undefined}>
                  <span>{s.label}</span>
                  <span>{format(s.values[hover])}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
