// One split-flap tile for the kickoff clock, so the countdown matches the
// headline. Adapted from Watermelon UI's FlipClock (MIT, ui.watermelon.sh):
// the old digit's top half falls away while the new digit's bottom half
// swings down. Colors and sizing live in index.css under .flip-*.

import { memo, useEffect, useState } from 'react'

function Half({ ch, top }: { ch: string; top: boolean }) {
  // The glyph is twice the half's height and shifted so only its top or bottom shows.
  return (
    <span className="flip-glyph" style={{ top: top ? '0%' : '-100%' }}>
      {ch}
    </span>
  )
}

const FlipDigit = memo(function FlipDigit({ ch }: { ch: string }) {
  // The tile flips while it still shows the old digit, then settles on the new one.
  const [prev, setPrev] = useState(ch)
  const flipping = ch !== prev

  useEffect(() => {
    if (!flipping) return
    const id = setTimeout(() => setPrev(ch), 550)
    return () => clearTimeout(id)
  }, [ch, flipping])

  return (
    <span className="flip-tile" aria-hidden="true">
      <span className="flip-half flip-top">
        <Half ch={ch} top />
      </span>
      <span className="flip-half flip-bottom">
        <Half ch={prev} top={false} />
      </span>
      <span className={`flip-half flip-top flip-fall${flipping ? ' go' : ''}`}>
        <Half ch={prev} top />
      </span>
      <span className={`flip-half flip-bottom flip-land${flipping ? ' go' : ''}`}>
        <Half ch={ch} top={false} />
      </span>
    </span>
  )
})

export default function FlipDigits({ value }: { value: string }) {
  return (
    <span className="flip-group">
      {[...value].map((ch, i) => (
        // Keyed from the right so the ones digit stays put when the day count shrinks.
        <FlipDigit key={value.length - i} ch={ch} />
      ))}
    </span>
  )
}
