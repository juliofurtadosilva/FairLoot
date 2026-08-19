import React, { useEffect, useState } from 'react'
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

  const renderLogTable = (entries: LogEntry[]) => (
    <table className="report-upload-log-table">
      <tbody>
        {entries.map(entry => (
          <tr key={entry.id} className={entry.success ? '' : 'report-upload-log-row--error'}>
            <td className="report-upload-log-date">{formatDate(entry.createdAt)}</td>
            <td>{entry.success ? '✓' : '✗'}</td>
            <td className="report-upload-log-diff" style={{ color: diffColor(entry.difficulty) }} title={entry.difficulty || undefined}>
              {diffLetter(entry.difficulty)}
            </td>
            <td>{entry.characterName || '—'}</td>
            <td className="report-upload-muted">{entry.spec}</td>
            <td className="report-upload-muted">{t('reports.historyBy')} {entry.submittedBy}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
            <div className="report-upload-log-columns">
              {renderLogTable(log.filter((_, i) => i % 2 === 0))}
              {renderLogTable(log.filter((_, i) => i % 2 === 1))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
