import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import api from '../services/api'
import { useApp } from '../context/AppContext'
import { isDemoMode } from '../services/demoData'
import './ReportUpload.scss'

type SubmitResult = {
  success: boolean
  error?: string | null
  characterName?: string | null
  realm?: string | null
  spec?: string | null
  source?: string | null
  difficulty?: string | null
}

type LogEntry = {
  id: string
  submittedBy: string
  characterName?: string | null
  realm?: string | null
  spec?: string | null
  source?: string | null
  difficulty?: string | null
  success: boolean
  errorMessage?: string | null
  createdAt: string
}

const diffColor = (d?: string | null) => {
  switch ((d || '').toLowerCase()) {
    case 'mythic': return 'var(--color-mythic)'
    case 'heroic': return 'var(--color-heroic)'
    case 'normal': return 'var(--color-green)'
    default: return 'var(--muted)'
  }
}

const diffLetter = (d?: string | null) => {
  switch ((d || '').toLowerCase()) {
    case 'mythic': return 'M'
    case 'heroic': return 'H'
    case 'normal': return 'N'
    default: return '—'
  }
}

export default function ReportUpload() {
  const { t, lang } = useApp()
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [url, setUrl] = useState('')
  const [sending, setSending] = useState(false)
  const [lastResult, setLastResult] = useState<SubmitResult | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  // how many rows fit in one column's actual available height — measured, not guessed, so the
  // left column always fills first (like a newspaper column) instead of a blind 50/50 split.
  const [rowsPerCol, setRowsPerCol] = useState(Infinity)
  const columnsRef = useRef<HTMLDivElement>(null)
  const firstRowRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!columnsRef.current || !firstRowRef.current || log.length === 0) return
    const containerHeight = columnsRef.current.clientHeight
    const rowHeight = firstRowRef.current.getBoundingClientRect().height
    if (rowHeight > 0) setRowsPerCol(Math.max(1, Math.floor(containerHeight / rowHeight)))
  }, [log])

  useEffect(() => {
    const onResize = () => {
      if (!columnsRef.current || !firstRowRef.current) return
      const containerHeight = columnsRef.current.clientHeight
      const rowHeight = firstRowRef.current.getBoundingClientRect().height
      if (rowHeight > 0) setRowsPerCol(Math.max(1, Math.floor(containerHeight / rowHeight)))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const fetchLog = async () => {
    if (isDemoMode()) return
    try {
      const r = await api.get('/api/guild/wowaudit/upload-report/history')
      setLog(r.data || [])
    } catch {}
  }

  useEffect(() => {
    if (isDemoMode()) { setConfigured(false); return }
    api.get('/api/guild')
      .then(r => setConfigured(!!r.data?.wowauditApiKey))
      .catch(() => setConfigured(false))
    fetchLog()
  }, [])

  const submit = async () => {
    const trimmed = url.trim()
    if (!trimmed || sending) return
    setSending(true)
    try {
      const r = await api.post('/api/guild/wowaudit/upload-report', { url: trimmed })
      setLastResult(r.data)
      setUrl('')
    } catch (e: any) {
      setLastResult(e?.response?.data || { success: false, error: e?.message || 'Erro ao enviar' })
    } finally {
      setSending(false)
      fetchLog()
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submit()
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  const renderLogRow = (entry: LogEntry, isFirst: boolean) => (
    <div key={entry.id} ref={isFirst ? firstRowRef : undefined} className={"report-upload-log-row" + (entry.success ? '' : ' report-upload-log-row--error')}>
      <span className="report-upload-log-date">{formatDate(entry.createdAt)}</span>
      <span>{entry.success ? '✓' : '✗'}</span>
      <span className="report-upload-log-diff" style={{ color: diffColor(entry.difficulty) }} title={entry.difficulty || undefined}>
        {diffLetter(entry.difficulty)}
      </span>
      <span>{entry.characterName || '—'}</span>
      <span className="report-upload-muted">{entry.spec}</span>
      <span className="report-upload-muted">{t('reports.historyBy')} {entry.submittedBy}</span>
    </div>
  )

  return (
    <div className="tab-content">
      <div className="tab-card admin-card report-upload-card">
        <h3 className="admin-title">{t('reports.title')}</h3>
        <p className="report-upload-desc">{t('reports.desc')}</p>

        {configured === false && (
          <div className="report-upload-warning">{t('reports.notConfigured')}</div>
        )}

        <div className="report-upload-form">
          <input
            className="report-upload-input"
            placeholder={t('reports.placeholder')}
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={sending}
            autoFocus
          />
          <button className="admin-btn report-upload-submit" onClick={submit} disabled={sending || !url.trim()}>
            {sending ? t('reports.sending') : t('reports.submit')}
          </button>
        </div>

        {lastResult && (
          <div className={`report-upload-entry ${lastResult.success ? 'report-upload-entry--ok' : 'report-upload-entry--error'}`}>
            {lastResult.success ? (
              <div>
                {lastResult.difficulty && (
                  <span className="report-upload-diff" style={{ color: diffColor(lastResult.difficulty) }} title={lastResult.difficulty}>
                    {diffLetter(lastResult.difficulty)}
                  </span>
                )}
                <strong>{lastResult.characterName}</strong>
                {lastResult.realm && <span className="report-upload-muted"> · {lastResult.realm}</span>}
                {lastResult.spec && <span className="report-upload-muted"> · {lastResult.spec}</span>}
                <span className="report-upload-badge">{lastResult.source}</span>
              </div>
            ) : (
              <div>{lastResult.error}</div>
            )}
          </div>
        )}

        <div className="report-upload-log">
          <div className="report-upload-log-header">{t('reports.history')}</div>
          {log.length === 0 ? (
            <div className="report-upload-log-empty">{t('reports.historyEmpty')}</div>
          ) : (
            <div className="report-upload-log-columns" ref={columnsRef}>
              <div className="report-upload-log-col">
                {log.slice(0, rowsPerCol).map((e, i) => renderLogRow(e, i === 0))}
              </div>
              <div className="report-upload-log-col">
                {log.slice(rowsPerCol).map(e => renderLogRow(e, false))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
