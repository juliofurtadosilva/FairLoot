import React, { useEffect, useState, useMemo } from 'react'
import api from '../services/api'
import { useApp } from '../context/AppContext'
import { isDemoMode, getDemoGuild, saveDemoGuild, getDemoCharacters, toggleDemoNewPlayer, getDemoLootHistory } from '../services/demoData'
import { getClassIconUrl, getClassNameLocalized, getClassColor } from '../services/classIcons'
import './AdminPanel.scss'

export default function AdminPanel() {
  const [guild, setGuild] = useState<any>(null)
  const [chars, setChars] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<any>({})
  const [search, setSearch] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [wowauditStatus, setWowauditStatus] = useState<'checking' | 'connected' | 'disconnected' | 'nokey'>('checking')
  const [wowauditCharCount, setWowauditCharCount] = useState(0)
  const { t, lang, theme, showAlert, showToast, showConfirm } = useApp()

  const fetchData = async () => {
    try {
      if (isDemoMode()) {
        const g = getDemoGuild()
        setGuild(g)
        setForm(g)
        setChars(getDemoCharacters())
        return
      }
      const r = await api.get('/api/guild')
      setGuild(r.data)
      setForm(r.data)
      const c = await api.get('/api/guild/characters')
      setChars(c.data || [])
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => { fetchData() }, [])

  // Check WowAudit connection status
  useEffect(() => {
    const checkWowaudit = async () => {
      if (isDemoMode()) {
        setWowauditStatus('connected')
        setWowauditCharCount(getDemoCharacters().length)
        return
      }
      try {
        const g = await api.get('/api/guild')
        if (!g.data?.wowauditApiKey) {
          setWowauditStatus('nokey')
          return
        }
        const r = await api.get('/api/guild/wowaudit/characters')
        const count = (r.data?.characters || []).length
        setWowauditCharCount(count)
        setWowauditStatus(count > 0 ? 'connected' : 'disconnected')
      } catch {
        setWowauditStatus('disconnected')
      }
    }
    checkWowaudit()
  }, [])

  const save = async () => {
    try {
      setLoading(true)
      if (isDemoMode()) {
        saveDemoGuild(form)
        setGuild(form)
        showToast(t('admin.saved'))
        return
      }
      await api.put('/api/guild', form)
      await fetchData()
      showToast(t('admin.saved'))
    } catch (e) {
      const resp = (e as any)?.response?.data
      const msg = resp ? JSON.stringify(resp) : (e as any)?.message || t('admin.saveError')
      console.error('Save guild error', resp || e)
      showAlert(msg)
    } finally { setLoading(false) }
  }

  const sync = async () => {
    if (isDemoMode()) return
    try {
      setLoading(true)
      await api.post('/api/guild/sync-characters')
      await fetchData()
      showToast(t('admin.synced'))
    } catch (e) { console.error(e); showAlert(t('admin.syncError')) } finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const sorted = [...chars].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    if (!q) return sorted
    return sorted.filter(c => (c.name || '').toLowerCase().includes(q) || (c.class || '').toLowerCase().includes(q))
  }, [chars, search])

  // Live preview: use real characters to show how weights affect priority
  const previewRanking = useMemo(() => {
    const a = form.priorityAlpha ?? 0.4
    const b = form.priorityBeta ?? 0.3
    const g = form.priorityGamma ?? 0.3

    // get loot history for score + recent count
    let drops: any[] = []
    if (isDemoMode()) {
      drops = getDemoLootHistory().filter((d: any) => d.assignedTo && !d.isReverted)
    }
    const recentCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    const recentMap: Record<string, number> = {}
    for (const d of drops) {
      if (new Date(d.createdAt).getTime() >= recentCutoff) {
        recentMap[d.assignedTo] = (recentMap[d.assignedTo] || 0) + 1
      }
    }

    // pick up to 5 real characters
    const sample = chars.slice(0, 5).map(c => {
      const hash = c.name.split('').reduce((acc: number, ch: string) => acc + ch.charCodeAt(0), 0)
      const upgradeRaw = 20 + (hash % 80)          // 20–99%
      return {
        name: c.name,
        className: c.class,
        upgradeRaw,                                  // raw upgrade %
        scoreRaw: c.score ?? 0,                      // accumulated score (pts)
        recentRaw: recentMap[c.name] ?? 0,            // items in last 30d
      }
    })
    if (sample.length === 0) return []

    const maxUpgrade = Math.max(...sample.map(c => c.upgradeRaw), 1)
    const maxScore = Math.max(...sample.map(c => c.scoreRaw), 1)
    const maxRecent = Math.max(...sample.map(c => c.recentRaw), 1)

    return sample
      .map(c => {
        const upgradeNorm = c.upgradeRaw / maxUpgrade
        const fairnessNorm = 1 - (c.scoreRaw / maxScore)
        const lootCountNorm = 1 - (c.recentRaw / maxRecent)
        const priority = a * upgradeNorm + b * fairnessNorm + g * lootCountNorm
        return { ...c, upgradeNorm, fairnessNorm, lootCountNorm, priority }
      })
      .sort((x, y) => y.priority - x.priority)
  }, [form.priorityAlpha, form.priorityBeta, form.priorityGamma, chars])

  const finalizeSeason = async () => {
    if (!(await showConfirm(t('admin.seasonFinalizeConfirm'), true))) return
    if (!(await showConfirm(t('admin.seasonFinalizeConfirm2'), true))) return
    try {
      if (isDemoMode()) {
        // demo: archive loot and reset scores
        const drops = getDemoLootHistory().filter((d: any) => !d.isReverted)
        if (drops.length === 0) { showAlert('Nenhum loot na season atual.'); return }
        const savedSeasons = sessionStorage.getItem('demoSeasons')
        const seasons = savedSeasons ? JSON.parse(savedSeasons) : []
        const earliest = drops.reduce((min: any, d: any) => new Date(d.createdAt) < new Date(min.createdAt) ? d : min, drops[0])
        const num = seasons.length + 1
        seasons.push({
          id: crypto.randomUUID(),
          name: `Season ${num}`,
          startedAt: earliest.createdAt,
          endedAt: new Date().toISOString(),
          drops: getDemoLootHistory(),
        })
        sessionStorage.setItem('demoSeasons', JSON.stringify(seasons))
        sessionStorage.removeItem('demoLootHistory')
        // reset scores
        const demoChars = getDemoCharacters()
        const flags: Record<string, boolean> = {}
        demoChars.forEach((c: any) => { flags[c.name] = c.isNewPlayer })
        sessionStorage.setItem('demoCharacters', JSON.stringify(flags))
        setChars(getDemoCharacters())
        showToast(t('admin.seasonFinalized'))
      } else {
        await api.post('/api/guild/season/finalize')
        await fetchData()
        showToast(t('admin.seasonFinalized'))
      }
    } catch (e: any) {
      showAlert(e?.response?.data || t('admin.seasonFinalizeError'))
    }
  }

  return (
    <div className="tab-content">
      <div className="card tab-card admin-card" style={{ padding: '24px 20px', gap: 16 }}>
        <h3 className="admin-title">{t('admin.title')}</h3>

        {guild ? (
          <div className="admin-body">
            {/* Settings section */}
            <div className="admin-settings">
              <div className="admin-section-label">{t('admin.settings')}</div>
              <div className="admin-field-row">
                <label className="admin-label">Wowaudit API Key:</label>
                <input
                  value={form.wowauditApiKey || ''}
                  onChange={e => setForm({ ...form, wowauditApiKey: e.target.value })}
                  className="admin-input"
                />
                <div className={`admin-wowaudit-status admin-wowaudit-status--${wowauditStatus}`}>
                  <span className="admin-wowaudit-dot" />
                  <span className="admin-wowaudit-label">
                    {wowauditStatus === 'checking' && t('admin.wowauditChecking')}
                    {wowauditStatus === 'connected' && `${t('admin.wowauditConnected')} · ${wowauditCharCount} ${t('admin.wowauditChars')}`}
                    {wowauditStatus === 'disconnected' && t('admin.wowauditDisconnected')}
                    {wowauditStatus === 'nokey' && t('admin.wowauditNoKey')}
                  </span>
                </div>
              </div>
              <div className="admin-weights-row">
                <div className="admin-weight-group">
                  <label style={{ fontSize: 12, color: '#fb923c' }}>α Alpha:</label>
                  <input type="number" step="0.05" min={0} max={1} value={form.priorityAlpha ?? 0.4}
                    onChange={e => setForm({ ...form, priorityAlpha: Number(e.target.value) })}
                    className="admin-weight-input"
                  />
                </div>
                <div className="admin-weight-group">
                  <label style={{ fontSize: 12, color: 'var(--color-cyan)' }}>β Beta:</label>
                  <input type="number" step="0.05" min={0} max={1} value={form.priorityBeta ?? 0.3}
                    onChange={e => setForm({ ...form, priorityBeta: Number(e.target.value) })}
                    className="admin-weight-input"
                  />
                </div>
                <div className="admin-weight-group">
                  <label style={{ fontSize: 12, color: 'var(--color-transmog)' }}>γ Gamma:</label>
                  <input type="number" step="0.05" min={0} max={1} value={form.priorityGamma ?? 0.3}
                    onChange={e => setForm({ ...form, priorityGamma: Number(e.target.value) })}
                    className="admin-weight-input"
                  />
                </div>
              </div>

              {/* Min iLevel inputs removed per request */}

              {/* Live preview */}
              {previewRanking.length > 0 && (
              <div className="admin-preview">
                <div className="admin-preview-title">{t('admin.preview')}</div>
                <div className="admin-preview-desc">{t('admin.previewDesc')}</div>
                <div className="admin-preview-item-example">
                  🗡️ <span>{lang === 'pt' ? 'Item exemplo:' : 'Example item:'}</span> <strong>Glaives of the Ruthless Executioner</strong>
                </div>
                <div className="admin-preview-table-wrap">
                  <table className="admin-preview-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{lang === 'pt' ? 'Jogador' : 'Player'}</th>
                        <th style={{ color: '#fb923c' }}>Upgrade (α)</th>
                        <th style={{ color: 'var(--color-cyan)' }}>Score (β)</th>
                        <th style={{ color: 'var(--color-transmog)' }}>{lang === 'pt' ? 'Recente 30d' : 'Recent 30d'} (γ)</th>
                        <th>{lang === 'pt' ? 'Prioridade' : 'Priority'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRanking.map((c, i) => (
                        <tr key={c.name}>
                          <td className="admin-preview-rank">#{i + 1}</td>
                          <td className="admin-preview-name-cell" style={{ color: getClassColor(c.className, theme) }}>{c.name}</td>
                          <td><span className="admin-preview-raw">{c.upgradeRaw}%</span></td>
                          <td><span className="admin-preview-raw">{c.scoreRaw.toFixed(1)}pts</span></td>
                          <td><span className="admin-preview-raw">{c.recentRaw} {lang === 'pt' ? 'itens' : 'items'}</span></td>
                          <td>
                            <div className="admin-preview-prio-cell">
                              <span className="admin-preview-bar-track">
                                <span className="admin-preview-bar" style={{ width: `${(c.priority / Math.max(previewRanking[0]?.priority || 0.01, 0.01)) * 100}%`, background: getClassColor(c.className, theme) }} />
                              </span>
                              <strong className="admin-preview-prio-value">{(c.priority * 100).toFixed(1)}%</strong>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="admin-preview-legend">
                  <span className="admin-preview-legend-item">
                    <strong style={{ color: '#fb923c' }}>Upgrade</strong>: {lang === 'pt' ? '% de melhoria do item (WowAudit). Maior % = maior prioridade.' : 'Item improvement % (WowAudit). Higher % = higher priority.'}
                  </span>
                  <span className="admin-preview-legend-item">
                    <strong style={{ color: 'var(--color-cyan)' }}>Score</strong>: {lang === 'pt' ? 'Total de itens já recebidos. Menor score = maior prioridade.' : 'Total items already received. Lower score = higher priority.'}
                  </span>
                  <span className="admin-preview-legend-item">
                    <strong style={{ color: 'var(--color-transmog)' }}>{lang === 'pt' ? 'Recente' : 'Recent'}</strong>: {lang === 'pt' ? 'Itens nos últimos 30 dias. Menos itens = maior prioridade.' : 'Items in last 30 days. Fewer items = higher priority.'}
                  </span>
                </div>
              </div>
              )}

              {/* Formula explanation — collapsible */}
              <div className="admin-formula-box">
                <div className="admin-formula-toggle" onClick={() => setShowHelp(!showHelp)}>
                  <span className="admin-formula-toggle-label">{t('admin.helpTitle')}</span>
                  <span className="admin-formula-toggle-arrow" style={{ transform: showHelp ? 'rotate(90deg)' : 'rotate(0)' }}>▶</span>
                </div>
                {showHelp && (
                  <div className="admin-formula-content">
                    <div className="admin-formula-equation">
                      Priority = <span style={{ color: '#fb923c' }}>α</span> × upgradeNorm + <span style={{ color: 'var(--color-cyan)' }}>β</span> × fairnessNorm + <span style={{ color: 'var(--color-transmog)' }}>γ</span> × lootCountNorm
                    </div>
                    <div className="admin-formula-grid">
                      <div className="admin-formula-item">
                        <span style={{ color: '#fb923c', fontWeight: 700 }}>{t('admin.formula.alphaTitle')}</span><br />
                        {t('admin.formula.alphaDesc')} <strong style={{ color: 'var(--text)' }}>{t('admin.formula.alphaHighlight')}</strong>
                      </div>
                      <div className="admin-formula-item">
                        <span style={{ color: 'var(--color-cyan)', fontWeight: 700 }}>{t('admin.formula.betaTitle')}</span><br />
                        {t('admin.formula.betaDesc')} <strong style={{ color: 'var(--text)' }}>{t('admin.formula.betaHighlight')}</strong>{t('admin.formula.betaSuffix')}
                      </div>
                      <div className="admin-formula-item">
                        <span style={{ color: 'var(--color-transmog)', fontWeight: 700 }}>{t('admin.formula.gammaTitle')}</span><br />
                        {t('admin.formula.gammaDesc')} <strong style={{ color: 'var(--text)' }}>{t('admin.formula.gammaHighlight')}</strong>{t('admin.formula.gammaSuffix')}
                      </div>
                    </div>
                    <div className="admin-formula-footer">
                      <strong>{t('admin.formula.tiebreakLabel')}</strong> {t('admin.formula.tiebreak')}<br />
                       <strong>{t('admin.formula.tipLabel')}</strong> {t('admin.formula.tip')}
                    </div>
                  </div>
                )}
              </div>
              <div className="admin-btn-row">
                <button onClick={save} disabled={loading} className="admin-btn">{t('admin.save')}</button>
                <button onClick={sync} disabled={loading} className="admin-btn">{t('admin.sync')}</button>
              </div>

              {/* Season management */}
              <div className="admin-season-section">
                <button onClick={finalizeSeason} disabled={loading} className="admin-btn admin-btn--danger">
                  🏁 {t('admin.seasonFinalize')}
                </button>
                <span className="admin-season-hint">{lang === 'pt' ? 'Arquiva o histórico e zera os scores. Requer confirmação dupla.' : 'Archives history and resets scores. Requires double confirmation.'}</span>
              </div>
            </div>

            {/* Characters section */}
            <div className="admin-chars-section">
              <div className="admin-chars-header">
                <div className="admin-chars-count">{t('admin.characters')} ({filtered.length})</div>
                <input
                  type="text"
                  placeholder={t('admin.search')}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="admin-search"
                />
              </div>
              <div className="admin-chars-grid">
                {filtered.length === 0 && <div className="admin-no-char">{t('admin.noChar')}</div>}
                {filtered.map((c, i) => {
                  const classIcon = getClassIconUrl(c.class)
                  const className = getClassNameLocalized(c.class, lang)
                  return (
                  <div key={i} className={`admin-char-card ${c.isNewPlayer ? 'admin-char-card--new' : ''}`}>
                    {classIcon && <img src={classIcon} alt={className} className="admin-char-icon" draggable={false} />}
                    <div className="admin-char-info">
                      <div className="admin-char-name class-color-text" style={{ color: getClassColor(c.class, theme) }}>{c.name}</div>
                      <div className="admin-char-class">{className}</div>
                    </div>
                    <div className="admin-char-right">
                      <div className="admin-char-score">
                        <div className="admin-char-score-value">{Number(c.score).toFixed(1)}</div>
                        <div className="admin-char-score-label">{t('admin.score')}</div>
                      </div>
                      <button
                        onClick={async () => {
                          if (isDemoMode()) {
                            toggleDemoNewPlayer(c.name)
                            setChars(getDemoCharacters())
                          } else {
                            try {
                              await api.post(`/api/guild/characters/${c.id}/toggle-new`)
                              await fetchData()
                            } catch {}
                          }
                        }}
                        title={t('admin.newPlayer')}
                        className={`admin-new-btn ${c.isNewPlayer ? 'admin-new-btn--active' : 'admin-new-btn--inactive'}`}
                      >{t('admin.newPlayer')}</button>
                    </div>
                  </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="admin-loading">{t('admin.loading')}</div>
        )}
      </div>
    </div>
  )
}
