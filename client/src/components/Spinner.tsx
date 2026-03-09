import React from 'react'

export default function Spinner({ size = 32, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 24, ...style }}>
      <div className="spinner" style={{ width: size, height: size }} />
    </div>
  )
}
