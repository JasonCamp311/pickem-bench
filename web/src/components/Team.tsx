// A team's abbreviation with a small chip in its two colors.

import type { CSSProperties } from 'react'
import { teamColors } from '@/lib/teams'

export function Chip({ team }: { team: string }) {
  const c = teamColors(team)
  if (!c) return null
  return <i className="team-chip" aria-hidden="true" style={{ '--a': c[0], '--b': c[1] } as CSSProperties} />
}

export default function Team({ team }: { team: string }) {
  return (
    <span className="team-name">
      <Chip team={team} />
      {team}
    </span>
  )
}

export function Matchup({ away, home }: { away: string; home: string }) {
  return (
    <>
      <Team team={away} /> at <Team team={home} />
    </>
  )
}
