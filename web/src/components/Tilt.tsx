// Leans a panel toward the pointer, a few degrees at most, and settles back
// when the pointer leaves. Does nothing for touch or reduced motion.

import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react'
import type { ReactNode } from 'react'
import { FOLLOW } from '@/lib/motion'

const LEAN = 5

export default function Tilt({ children, className }: { children: ReactNode; className?: string }) {
  const calm = useReducedMotion()
  const rx = useSpring(useMotionValue(0), FOLLOW)
  const ry = useSpring(useMotionValue(0), FOLLOW)
  if (calm) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return
        const box = e.currentTarget.getBoundingClientRect()
        ry.set(((e.clientX - box.left) / box.width - 0.5) * 2 * LEAN)
        rx.set(-((e.clientY - box.top) / box.height - 0.5) * 2 * LEAN)
      }}
      onPointerLeave={() => {
        rx.set(0)
        ry.set(0)
      }}
    >
      {children}
    </motion.div>
  )
}
