// A number whose digits roll like an odometer: once when it first scrolls into
// view, and again whenever the value changes.

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

export default function Roll({ value, quick }: { value: string | number; quick?: boolean }) {
  const text = String(value)
  const ref = useRef<HTMLSpanElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const watcher = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setSeen(true)
      watcher.disconnect()
    })
    watcher.observe(el)
    return () => watcher.disconnect()
  }, [])
  const chars = [...text]
  return (
    <span ref={ref} className={`roll${quick ? ' quick' : ''}`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {chars.map((ch, i) => {
          // Keyed from the right, so the ones digit stays the ones digit when a number grows.
          const place = chars.length - i
          if (!/\d/.test(ch)) return <span key={`${place}${ch}`}>{ch}</span>
          return (
            <span key={place} className="roll-d" style={{ '--d': seen ? Number(ch) : 0, '--n': place } as CSSProperties}>
              <span className="roll-ghost">{ch}</span>
              <span className="roll-col">
                {DIGITS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </span>
            </span>
          )
        })}
      </span>
    </span>
  )
}
