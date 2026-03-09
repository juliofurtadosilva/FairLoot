import React, { useEffect, useState, useMemo } from 'react'
import api from '../services/api'
import { useApp } from '../context/AppContext'

const classColors: Record<string, string> = {
  'death knight': '#C41E3A',
  'demon hunter': '#A330C9',
  'druid': '#FF7C0A',
  'evoker': '#33937F',
  'hunter': '#AAD372',
  'mage': '#3FC7EB',
  'monk': '#00FF98',
  'paladin': '#F48CBA',
  'priest': '#FFFFFF',
  'rogue': '#FFF468',
  'shaman': '#0070DD',
  'warlock': '#8788EE',
  'warrior': '#C69B6D',
}

const getClassColor = (cls?: string) => {
  if (!cls) return '#e8edff'
  return classColors[cls.toLowerCase()] ?? '#e8edff'
}

export default function AdminPanel() {
  const [guild, setGuild] = useState<any>(null)
  const [chars, setChars] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<any>({})
  const [search, setSearch] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const { t } = useApp()

  const fetchData = async () => {
    try {
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

  const save = async () => {
    try {
      setLoading(true)
      await api.put('/api/guild', form)
      await fetchData()
      alert(t('admin.saved'))
    } catch (e) {
      const resp = (e as any)?.response?.data
      const msg = resp ? JSON.stringify(resp) : (e as any)?.message || t('admin.saveError')
      console.error('Save guild error', resp || e)
      alert(msg)
    } finally { setLoading(false) }
  }

  const sync = async () => {
    try {
      setLoading(true)
      await api.post('/api/guild/sync-characters')
      await fetchData()
      alert(t('admin.synced'))
    } catch (e) { console.error(e); alert(t('admin.syncError')) } finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const sorted = [...chars].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    if (!q) return sorted
    return sorted.filter(c => (c.name || '').toLowerCase().includes(q) || (c.class || '').toLowerCase().includes(q))
  }, [chars, search])

  return (
    <div className="tab-content">
      <div className="card tab-card admin-card" style={{ padding: '24px 20px', gap: 16 }}>
        <h3 style={{ margin: 0, textAlign: 'center', fontSize: 18 }}>{t('admin.title')}</h3>

        {guild ? (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Settings section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--panel-bg)', borderRadius: 8, padding: '16px 18px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{t('admin.settings')}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 12, color: 'var(--muted)', minWidth: 120 }}>Wowaudit API Key:</label>
                <input
                  value={form.wowauditApiKey || ''}
                  onChange={e => setForm({ ...form, wowauditApiKey: e.target.value })}
                  style={{ flex: 1, minWidth: 200, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 13 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, color: '#fb923c' }}>α Alpha:</label>
                  <input type="number" step="0.05" min={0} max={1} value={form.priorityAlpha ?? 0.4}
                    onChange={e => setForm({ ...form, priorityAlpha: Number(e.target.value) })}
                    style={{ width: 60, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 13, textAlign: 'center' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, color: 'var(--color-cyan)' }}>β Beta:</label>
                  <input type="number" step="0.05" min={0} max={1} value={form.priorityBeta ?? 0.3}
                    onChange={e => setForm({ ...form, priorityBeta: Number(e.target.value) })}
                    style={{ width: 60, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 13, textAlign: 'center' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, color: 'var(--color-transmog)' }}>γ Gamma:</label>
                  <input type="number" step="0.05" min={0} max={1} value={form.priorityGamma ?? 0.3}
                    onChange={e => setForm({ ...form, priorityGamma: Number(e.target.value) })}
                    style={{ width: 60, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 13, textAlign: 'center' }}
                  />
                </div>
              </div>

              {/* Formula explanation — collapsible */}
              <div style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.15)', borderRadius: 6, marginTop: 4, overflow: 'hidden' }}>
                <div
                  onClick={() => setShowHelp(!showHelp)}
                  style={{ padding: '10px 14px', cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-transmog)' }}>{t('admin.helpTitle')}</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)', transition: 'transform 0.2s', transform: showHelp ? 'rotate(90deg)' : 'rotate(0)' }}>▶</span>
                </div>
                {showHelp && (
                  <div style={{ padding: '0 14px 14px' }}>
                    <div style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'monospace', background: 'var(--panel-bg)', padding: '8px 12px', borderRadius: 4, marginBottom: 10, textAlign: 'center' }}>
                      Priority = <span style={{ color: '#fb923c' }}>α</span> × upgradeNorm + <span style={{ color: 'var(--color-cyan)' }}>β</span> × fairnessNorm + <span style={{ color: 'var(--color-transmog)' }}>γ</span> × lootCountNorm
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, textAlign: 'justify' }}>
                        <span style={{ color: '#fb923c', fontWeight: 700 }}>{t('admin.formula.alphaTitle')}</span><br />
                        {t('admin.formula.alphaDesc')} <strong style={{ color: 'var(--text)' }}>{t('admin.formula.alphaHighlight')}</strong>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, textAlign: 'justify' }}>
                        <span style={{ color: 'var(--color-cyan)', fontWeight: 700 }}>{t('admin.formula.betaTitle')}</span><br />
                        {t('admin.formula.betaDesc')} <strong style={{ color: 'var(--text)' }}>{t('admin.formula.betaHighlight')}</strong>{t('admin.formula.betaSuffix')}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, textAlign: 'justify' }}>
                        <span style={{ color: 'var(--color-transmog)', fontWeight: 700 }}>{t('admin.formula.gammaTitle')}</span><br />
                        {t('admin.formula.gammaDesc')} <strong style={{ color: 'var(--text)' }}>{t('admin.formula.gammaHighlight')}</strong>{t('admin.formula.gammaSuffix')}
                      </div>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, textAlign: 'justify' }}>
                      <strong style={{ color: 'var(--muted)' }}>{t('admin.formula.tiebreakLabel')}</strong> {t('admin.formula.tiebreak')}<br />
                       <strong style={{ color: 'var(--muted)' }}>{t('admin.formula.tipLabel')}</strong> {t('admin.formula.tip')}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={save} disabled={loading} style={{ padding: '7px 20px', fontSize: 13 }}>{t('admin.save')}</button>
                <button onClick={sync} disabled={loading} style={{ padding: '7px 20px', fontSize: 13 }}>{t('admin.sync')}</button>
              </div>
            </div>

            {/* Characters section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('admin.characters')} ({filtered.length})</div>
                <input
                  type="text"
                  placeholder={t('admin.search')}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(var(--accent-rgb),0.3)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 12, width: 180 }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6, maxHeight: 'calc(100vh - 520px)', overflowY: 'auto' }}>
                {filtered.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13, gridColumn: '1 / -1', textAlign: 'center', padding: 16 }}>{t('admin.noChar')}</div>}
                {filtered.map((c, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderRadius: 6,
                    background: 'var(--panel-bg)', border: '1px solid var(--border)',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: getClassColor(c.class), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{c.class || '—'}</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0, marginLeft: 8, textAlign: 'right' }}>
                      <div style={{ fontWeight: 600 }}>{Number(c.score).toFixed(0)}</div>
                      <div style={{ fontSize: 9, color: 'var(--muted)' }}>{t('admin.score')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--muted)' }}>{t('admin.loading')}</div>
        )}
      </div>
    </div>
  )
}
