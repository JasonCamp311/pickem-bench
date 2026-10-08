// Shared timing for anything animated from JavaScript. The CSS side of the same
// values lives in the :root block of index.css; keep the two in step.

export const EASE_OUT = [0.23, 1, 0.32, 1] as const

// A selected marker sliding between buttons.
export const PILL = { type: 'spring', stiffness: 420, damping: 34 } as const
// Rows trading places in the standings.
export const REORDER = { type: 'spring', duration: 0.6, bounce: 0.14 } as const
// Things that follow the pointer.
export const FOLLOW = { stiffness: 180, damping: 20, mass: 0.6 } as const
// Seconds between items that enter one after another.
export const STAGGER = 0.04
