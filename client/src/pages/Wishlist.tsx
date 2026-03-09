import React, { useEffect, useState, useMemo } from 'react'
import api from '../services/api'
import { useApp } from '../context/AppContext'

type Encounter = {
  name: string
  encounterPercentage: number
  encounterAbsolute: number
  items: { name: string; id?: number | null; icon?: string; percentage?: number; absolute?: number; specialization?: string | null }[]
}

type Difficulty = {
  difficulty: string
  totalPercentage: number
  totalAbsolute: number
  encounters: Encounter[]
}

type InstanceData = {
  name: string
  difficulties: Difficulty[]
}

type CharSummary = {
  name: string
  realm: string
  class?: string
  overallPercentage: number
  difficulties: Difficulty[]
  instances?: InstanceData[]
}

const diffOrder: Record<string, number> = { mythic: 0, heroic: 1, normal: 2 }
const orderedDiffs = ['normal', 'heroic', 'mythic']

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

export default function Wishlist() {
  const [list, setList] = useState<CharSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [expandedChars, setExpandedChars] = useState<Set<string>>(new Set())
  const [selectedRaid, setSelectedRaid] = useState<string>('')
  const { t } = useApp()

  const fetchData = async () => {
    try {
      const r = await api.get('/api/guild/wowaudit/wishlists')
      setList(r.data?.summary || [])
    } catch (err: any) {
      setError(err?.response?.data || t('wishlist.error'))
    }
  }

  useEffect(() => { fetchData() }, [])

  const raids = useMemo(() => {
    const set = new Set<string>()
    for (const c of list) {
      if (c.instances) for (const inst of c.instances) set.add(inst.name)
    }
    return Array.from(set)
  }, [list])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return list.filter(c => !q || c.name.toLowerCase().includes(q) || (c.class || '').toLowerCase().includes(q))
  }, [list, search])

  const toggleChar = (name: string) => {
    setExpandedChars(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  const getInstancesForChar = (c: CharSummary): InstanceData[] => {
    if (!c.instances) return []
    let insts = c.instances
    if (selectedRaid) insts = insts.filter(inst => inst.name === selectedRaid)
    return insts
  }

  const diffColor = (d: string) => {
    switch (d.toLowerCase()) {
      case 'mythic': return 'var(--color-mythic)'
      case 'heroic': return 'var(--color-heroic)'
      case 'normal': return 'var(--color-green)'
      default: return 'var(--muted)'
    }
  }

  const percColor = (p: number) => {
    if (p >= 60) return 'var(--color-cyan)'
    if (p >= 30) return 'var(--color-yellow)'
    if (p > 0) return 'var(--color-mythic)'
    return 'var(--muted)'
  }

  return (
    <div className="tab-content">
      <div className="card tab-card wishlist-card" style={{ padding: '24px 20px', gap: 14 }}>
        <h3 style={{ margin: 0, textAlign: 'center', fontSize: 18 }}>{t('wishlist.title')}</h3>

        {error && <div style={{ color: '#f97316', textAlign: 'center' }}>{error}</div>}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
          <input
            type="text"
            placeholder={t('wishlist.search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: '1 1 200px', maxWidth: 300, padding: '8px 12px', borderRadius: 8,
              border: '1px solid rgba(var(--accent-rgb),0.3)', background: 'var(--input-bg)',
              color: 'var(--text)', fontSize: 14, outline: 'none',
            }}
          />
          {raids.length > 1 && (
            <select
              value={selectedRaid}
              onChange={e => setSelectedRaid(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--select-bg)',
                color: 'var(--text)', fontSize: 13,
              }}
            >
              <option value="">{t('wishlist.allRaids')}</option>
              {raids.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
        </div>

        <div style={{ color: 'var(--muted)', fontSize: 11, textAlign: 'center' }}>
          {filtered.length} {filtered.length !== 1 ? t('wishlist.players') : t('wishlist.player')}
        </div>

        {/* Character list */}
        <div className="wishlist-scroll" style={{ width: '100%', maxHeight: 'calc(100vh - 300px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.length === 0 && <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>{t('wishlist.noPlayer')}</div>}
          {filtered.map((c, idx) => {
            const isExpanded = expandedChars.has(c.name)
            const charInstances = getInstancesForChar(c)
            const nameColor = getClassColor(c.class)

            return (
              <div key={idx} style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: isExpanded ? 'rgba(var(--accent-rgb),0.05)' : 'var(--surface)',
                transition: 'background 0.2s',
              }}>
                {/* Header row */}
                <div
                  onClick={() => toggleChar(c.name)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 14px', cursor: 'pointer', userSelect: 'none',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 9, color: 'var(--muted)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)' }}>▶</span>
                    <strong style={{ fontSize: 13, color: nameColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{c.realm}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: percColor(c.overallPercentage) }}>
                      {c.overallPercentage.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Expanded: 3-column layout per raid */}
                {isExpanded && (
                  <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {charInstances.map((inst, ii) => {
                      const diffMap = new Map<string, Difficulty>()
                      for (const d of inst.difficulties) diffMap.set(d.difficulty.toLowerCase(), d)
                      return (
                        <div key={ii}>
                          {(raids.length > 1 || !selectedRaid) && (
                            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 6, borderBottom: '1px solid var(--border)', paddingBottom: 3 }}>
                              {inst.name}
                            </div>
                          )}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                            {orderedDiffs.map(diffKey => {
                              const d = diffMap.get(diffKey)
                              return (
                                <div key={diffKey} style={{
                                  background: 'var(--panel-bg)', borderRadius: 6,
                                  padding: '8px 10px', minWidth: 0,
                                  border: `1px solid var(--border)`,
                                  opacity: d ? 1 : 0.4,
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: diffColor(diffKey) }}>
                                      {diffKey}
                                    </span>
                                    {d && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{d.totalPercentage.toFixed(1)}%</span>}
                                  </div>
                                  {d ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                      {d.encounters.map((e, j) => {
                                        const activeItems = e.items.filter(it => (it.percentage ?? 0) > 0)
                                        if (activeItems.length === 0) return null
                                        return (
                                          <div key={j}>
                                            <div style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                                              <span style={{ color: 'var(--text)', fontWeight: 600 }}>{e.name}</span>
                                              <span style={{ color: percColor(e.encounterPercentage), fontSize: 10, flexShrink: 0, marginLeft: 6 }}>{e.encounterPercentage > 0 ? `${e.encounterPercentage.toFixed(1)}%` : ''}</span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                              {activeItems.map((it, k) => (
                                                <div key={k} style={{ paddingLeft: 6, fontSize: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                                                  {it.icon && <img src={it.icon} alt="" style={{ width: 14, height: 14, borderRadius: 2, flexShrink: 0 }} onError={ev => { (ev.currentTarget as HTMLImageElement).style.display = 'none' }} />}
                                                  <span style={{ color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{it.name}</span>
                                                  <span style={{ color: percColor(it.percentage ?? 0), fontWeight: 600, flexShrink: 0 }}>{(it.percentage ?? 0).toFixed(1)}%</span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>—</div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
