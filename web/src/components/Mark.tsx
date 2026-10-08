// The result drawn next to a graded pick: a check, a cross, or a star for an
// exact final score. Each one draws itself in when it first appears.

const SHAPES = {
  W: 'M3 8.5l3.2 3.2L13 4.8',
  L: 'M4 4l8 8M12 4l-8 8',
  star: 'M8 1.6l1.9 4.1 4.5.5-3.3 3 .9 4.4L8 11.4l-4 2.2.9-4.4-3.3-3 4.5-.5z',
}
const NAMES = { W: 'right', L: 'wrong', star: 'exact final score' }

export default function Mark({ kind }: { kind: 'W' | 'L' | 'star' }) {
  return (
    <svg className={`mark mark-${kind}`} viewBox="0 0 16 16" width="14" height="14" role="img" aria-label={NAMES[kind]}>
      <path d={SHAPES[kind]} pathLength={1} />
    </svg>
  )
}
