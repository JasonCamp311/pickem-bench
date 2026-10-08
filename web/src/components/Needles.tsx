// The backdrop: a field of short dashes, like hash marks on a field. Dashes
// near the pointer turn to aim at it, lengthen and light up, and settle back
// when it moves on. A press sends a ring outward that spins the dashes it
// crosses. Drawn on one canvas, and only while something is moving.

import { useEffect, useRef } from 'react'

const GAP = 34
// How far the pointer reaches, in pixels.
const REACH = 190
const IDLE = 6
const GROW = 11
// A press: how fast the ring travels (px a second), how wide it is, how long it lasts.
const RING_SPEED = 760
const RING_WIDTH = 90
const RING_LIFE = 1500
const STEPS = 7

type Rgb = [number, number, number]
const mix = (a: Rgb, b: Rgb, t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(' ')})`

export default function Needles({ idle, near, hot }: { idle: Rgb; near: Rgb; hot: Rgb }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    // One shade per step from resting to fully lit: idle, through `near`, to `hot`.
    const shades = Array.from({ length: STEPS }, (_, i) => {
      const t = i / (STEPS - 1)
      return t < 0.5 ? mix(idle, near, t * 2) : mix(near, hot, t * 2 - 1)
    })
    let cols = 0
    let rows = 0
    let w = 0
    let h = 0
    // Per dash: its current angle and how lit it is (0 to 1).
    let angle = new Float32Array(0)
    let lit = new Float32Array(0)
    const pointer = { x: -9999, y: -9999 }
    let rings: { x: number; y: number; born: number }[] = []
    let frame = 0

    const size = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * scale
      canvas.height = h * scale
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      ctx.lineCap = 'round'
      cols = Math.ceil(w / GAP) + 1
      rows = Math.ceil(h / GAP) + 1
      angle = new Float32Array(cols * rows)
      lit = new Float32Array(cols * rows)
      wake()
    }

    const draw = (now: number) => {
      frame = 0
      rings = rings.filter((r) => now - r.born < RING_LIFE)
      ctx.clearRect(0, 0, w, h)
      const paths = shades.map(() => new Path2D())
      let moving = rings.length > 0
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c
          const x = c * GAP + (r % 2 ? GAP / 2 : 0)
          const y = r * GAP
          const dx = pointer.x - x
          const dy = pointer.y - y
          const d = Math.hypot(dx, dy)
          let want = d < REACH ? (1 - d / REACH) ** 2 : 0
          let aim = want > 0 ? Math.atan2(dy, dx) : 0
          for (const ring of rings) {
            const age = now - ring.born
            const from = Math.hypot(x - ring.x, y - ring.y) - (age / 1000) * RING_SPEED
            if (Math.abs(from) > RING_WIDTH) continue
            const push = (1 - Math.abs(from) / RING_WIDTH) * (1 - age / RING_LIFE)
            if (push > want) {
              want = push
              // Across the ring, so the wave reads as a turning edge.
              aim = Math.atan2(y - ring.y, x - ring.x) + Math.PI / 2
            }
          }
          // A dash looks the same turned half way round, so take the short way.
          let turn = (aim - angle[i]) % Math.PI
          if (turn > Math.PI / 2) turn -= Math.PI
          if (turn < -Math.PI / 2) turn += Math.PI
          angle[i] += turn * 0.16
          lit[i] += (want - lit[i]) * (want > lit[i] ? 0.22 : 0.07)
          if (Math.abs(turn) > 0.004 || Math.abs(want - lit[i]) > 0.004) moving = true
          const half = (IDLE + GROW * lit[i]) / 2
          const ax = Math.cos(angle[i]) * half
          const ay = Math.sin(angle[i]) * half
          const path = paths[Math.min(STEPS - 1, Math.round(lit[i] * (STEPS - 1)))]
          path.moveTo(x - ax, y - ay)
          path.lineTo(x + ax, y + ay)
        }
      }
      paths.forEach((p, i) => {
        ctx.strokeStyle = shades[i]
        ctx.lineWidth = 1.5 + (i / (STEPS - 1)) * 1.1
        ctx.stroke(p)
      })
      if (moving) wake()
    }
    function wake() {
      if (!frame && document.visibilityState === 'visible') frame = requestAnimationFrame(draw)
    }

    const move = (e: PointerEvent) => {
      pointer.x = e.clientX
      pointer.y = e.clientY
      wake()
    }
    const leave = () => {
      pointer.x = pointer.y = -9999
      wake()
    }
    const press = (e: PointerEvent) => {
      rings.push({ x: e.clientX, y: e.clientY, born: performance.now() })
      if (rings.length > 4) rings.shift()
      wake()
    }
    size()
    window.addEventListener('resize', size)
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', press, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)
    document.addEventListener('visibilitychange', wake)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', size)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', press)
      document.documentElement.removeEventListener('pointerleave', leave)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [idle, near, hot])
  return <canvas ref={ref} className="needles" />
}
