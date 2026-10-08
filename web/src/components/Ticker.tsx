// The talking-points ticker: one line that scrolls on its own, speeds up or
// turns around with the page scroll, slows to a stop under the pointer or
// keyboard focus, and opens a game's breakdown when a line about it is pressed.

import { useEffect, useRef, useState } from 'react'
import { useAnimationFrame, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, useVelocity, motion } from 'motion/react'
import type { CSSProperties } from 'react'
import type { Headline } from '@/lib/card'

// Pixels a second at rest.
const SPEED = 46

function Items({ items, onOpen, inert }: { items: Headline[]; onOpen: (game: string) => void; inert?: boolean }) {
  return (
    <>
      {items.map((h, i) =>
        h.game ? (
          <button
            key={h.text}
            className="ticker-item"
            style={{ '--i': Math.min(i, 8) } as CSSProperties}
            tabIndex={inert ? -1 : undefined}
            onClick={() => onOpen(h.game!)}
          >
            {h.text}
          </button>
        ) : (
          <span key={h.text} className="ticker-item" style={{ '--i': Math.min(i, 8) } as CSSProperties}>
            {h.text}
          </span>
        ),
      )}
    </>
  )
}

export default function Ticker({ items, onOpen }: { items: Headline[]; onOpen: (game: string) => void }) {
  const calm = useReducedMotion()
  const [held, setHeld] = useState(false)
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const view = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ view: 0, copy: 0 })
  // A new set of talking points (another week, another track, fresh results)
  // remounts the line so the items come in again.
  const sig = items.map((h) => h.text).join('|')

  useEffect(() => {
    const v = view.current
    const c = first.current
    if (!v || !c) return
    const measure = () => setSize({ view: v.clientWidth, copy: c.offsetWidth })
    measure()
    const watcher = new ResizeObserver(measure)
    watcher.observe(v)
    watcher.observe(c)
    return () => watcher.disconnect()
  }, [sig, calm])

  const x = useMotionValue(0)
  const { scrollY } = useScroll()
  const smooth = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 })
  const boost = useTransform(smooth, [0, 1000], [0, 5], { clamp: false })
  // 1 at full speed, 0 stopped; it eases between the two so a pause is a
  // slow-down and not a freeze.
  const pace = useRef(1)
  const way = useRef(1)
  const stopped = held || hover || focus
  useAnimationFrame((_, delta) => {
    const dt = Math.min(delta, 64)
    pace.current += ((stopped ? 0 : 1) - pace.current) * Math.min(1, dt / 160)
    if (!size.copy || pace.current < 0.002) return
    const b = boost.get()
    if (b < 0) way.current = -1
    else if (b > 0) way.current = 1
    const step = way.current * SPEED * (dt / 1000) * (1 + Math.abs(b)) * pace.current
    let next = x.get() - step
    if (next <= -size.copy) next += size.copy
    if (next > 0) next -= size.copy
    x.set(next)
  })

  if (!items.length) return null
  // Reduced motion: the same lines, standing still and wrapped.
  if (calm) {
    return (
      <div className="ticker still" aria-label="This week's talking points">
        <Items items={items} onOpen={onOpen} />
      </div>
    )
  }

  // A focused line may be off screen; bring it to the left edge instead of
  // letting the browser scroll the clipped box.
  const onFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    setFocus(true)
    const el = e.target as HTMLElement
    if (!el.classList.contains('ticker-item') || !first.current?.contains(el)) return
    x.set(-Math.max(0, el.offsetLeft - 24))
    if (view.current) view.current.scrollLeft = 0
  }
  const copies = size.copy ? Math.ceil(size.view / size.copy) + 1 : 2

  return (
    <div
      className="ticker"
      aria-label="This week's talking points"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={onFocus}
      onBlur={() => setFocus(false)}
    >
      <button className="ticker-hold" aria-pressed={held} aria-label={held ? 'Start the ticker' : 'Pause the ticker'} onClick={() => setHeld(!held)}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          {held ? <path d="M4 2.5v11l9-5.5z" /> : <path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" />}
        </svg>
      </button>
      <div className="ticker-view" ref={view} onScroll={(e) => (e.currentTarget.scrollLeft = 0)}>
        <i key={`sweep ${sig}`} className="ticker-sweep" aria-hidden="true" />
        <motion.div key={sig} className="ticker-line" style={{ x }}>
          <div className="ticker-copy" ref={first}>
            <Items items={items} onOpen={onOpen} />
          </div>
          {Array.from({ length: copies - 1 }, (_, i) => (
            <div key={i} className="ticker-copy" aria-hidden="true">
              <Items items={items} onOpen={onOpen} inert />
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}
