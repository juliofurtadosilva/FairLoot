import React from 'react'
import './Skeleton.scss'

type Props = {
  /** Number of skeleton rows to show */
  count?: number
  /** Use grid layout (for card grids like Members) */
  grid?: boolean
  /** Show taller cards */
  tall?: boolean
}

export default function Skeleton({ count = 4, grid = false, tall = false }: Props) {
  const rows = Array.from({ length: count }, (_, i) => (
    <div key={i} className="skeleton-row">
      <div className="skeleton skeleton-circle" />
      <div className="skeleton-row-body">
        <div className={`skeleton skeleton-text`} />
        <div className={`skeleton skeleton-text skeleton-text--short`} />
      </div>
    </div>
  ))

  if (grid) {
    return <div className="skeleton-grid">{rows}</div>
  }

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>{rows}</div>
}
