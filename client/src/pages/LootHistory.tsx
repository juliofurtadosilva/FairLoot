import React, { useEffect, useState } from 'react'
import api from '../services/api'
import { useApp } from '../context/AppContext'

export default function LootHistory() {
  const [drops, setDrops] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const { t } = useApp()

  const fetchHistory = async () => {
    try {
      const r = await api.get('/api/loot/history')
      setDrops(r.data || [])
    } catch (err: any) {
      setError(err?.response?.data || t('history.errorFetch'))
    }
  }

  useEffect(() => { fetchHistory() }, [])

  const undo = async (id: string) => {
    if (!confirm(t('history.undoConfirm'))) return
    try {
      await api.post(`/api/loot/undo/${id}`)
      fetchHistory()
    } catch (err: any) {
      alert(err?.response?.data || t('history.errorUndo'))
    }
  }

  return (
    <div>
      <h3>{t('history.title')}</h3>
      {error && <div style={{ color: '#ef4444' }}>{error}</div>}
      {drops.length === 0 && <div>{t('history.noRecords')}</div>}
      {drops.map(d => (
        <div key={d.id} className="card" style={{ marginBottom: 8 }}>
          <div><strong>{d.itemName}</strong> — {d.boss} ({d.difficulty})</div>
          {d.assignedTo ? (
            <div>{t('history.to')} {d.assignedTo} — {t('history.value')} {Number(d.awardValue).toFixed(2)}</div>
          ) : (
            <div style={{ color: 'var(--color-transmog)' }}>{t('history.transmog')}</div>
          )}
          <div>{t('history.at')} {new Date(d.createdAt).toLocaleString()}</div>
          <div style={{ marginTop: 6 }}>
            <button onClick={() => undo(d.id)}>{t('history.undo')}</button>
          </div>
        </div>
      ))}
    </div>
  )
}
