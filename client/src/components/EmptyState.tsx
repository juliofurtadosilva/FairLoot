import React from 'react'
import './EmptyState.scss'

type Props = {
  icon: string
  message: string
  sub?: string
}

export default function EmptyState({ icon, message, sub }: Props) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <div className="empty-state-message">{message}</div>
      {sub && <div className="empty-state-sub">{sub}</div>}
    </div>
  )
}
