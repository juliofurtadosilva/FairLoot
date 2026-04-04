import React, { useEffect, useState, useMemo } from 'react'
import api from '../services/api'
import { useApp } from '../context/AppContext'
import Spinner from '../components/Spinner'
import { isDemoMode, getDemoWishlistSummary, getDemoGuild } from '../services/demoData'
import { getCachedWishlist, setCachedWishlist } from '../services/wishlistCache'
import { getClassColor, getClassIconUrl } from '../services/classIcons'
import EmptyState from '../components/EmptyState'
import './Wishlist.scss'

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
  hasSimcReport?: boolean
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

export default function Wishlist() {
  const [list, setList] = useState<CharSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [expandedChars, setExpandedChars] = useState<Set<string>>(new Set())
  const [selectedRaid, setSelectedRaid] = useState<string>('')
  const [initialLoading, setInitialLoading] = useState(true)
  // simc filter removed from Wishlist — controlled in Dashboard
  // guild/characters removed: iLevel logic was cancelled
  const { t, theme } = useApp()

  const resolveIconsForSummary = async (data: CharSummary[]) => {
    const ids = new Set<number>()
    for (const ch of data) {
      if (!ch.instances) continue
      for (const inst of ch.instances) {
        for (const d of inst.difficulties) {
          for (const enc of d.encounters) {
            for (const it of enc.items) {
              if (it.id && !it.icon) ids.add(it.id)
            }
          }
        }
      }
    }
    if (ids.size === 0) return data
    try {
      const res = await api.post('/api/loot/icons', [...ids])
      const iconMap = res.data as Record<number, string | null>
      return data.map(ch => ({
        ...ch,
        instances: ch.instances?.map(inst => ({
          ...inst,
          difficulties: inst.difficulties.map(d => ({
            ...d,
            encounters: d.encounters.map(enc => ({
              ...enc,
              items: enc.items.map(it => ({
                ...it,
                icon: it.icon || (it.id ? iconMap[it.id] ?? undefined : undefined),
              })),
            })),
          })),
        })),
      }))
    } catch { return data }
  }

  // fetchData optionally forces a fresh pull from WowAudit when `force` is true
  const fetchData = async (force = false) => {
    try {
      if (isDemoMode()) {
        let data = getDemoWishlistSummary()
        setList(data)
        // resolve icons asynchronously
        resolveIconsForSummary(data).then(updated => {
          setList(updated)
          try { window.dispatchEvent(new CustomEvent('fairloot:wishlist:updated', { detail: updated })) } catch {}
        }).catch(() => {})
      } else {
        // show cached data instantly while fetching fresh
        const cached = getCachedWishlist()
        if (cached && cached.length > 0) {
          setList(cached as CharSummary[])
          setInitialLoading(false)
        }
        const r = await api.get('/api/guild/wowaudit/wishlists', { params: { force } })
        const summary = r.data?.summary || []
        setList(summary)
        if (summary.length > 0) setCachedWishlist(summary)
        try { window.dispatchEvent(new CustomEvent('fairloot:wishlist:updated', { detail: summary })) } catch {}
      }
    } catch (err: any) {
      setError(err?.response?.data || t('wishlist.error'))
    } finally {
      setInitialLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  // iLevel indicators were removed per request — no guild/character iLevel fetch needed

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

  // check if a character has SimC report for a given difficulty
  const hasSimcForDiff = (c: CharSummary, diff: string): boolean => {
    if (!c.instances) return false
    for (const inst of c.instances) {
      for (const d of inst.difficulties) {
        if (d.difficulty.toLowerCase() === diff && d.hasSimcReport) return true
      }
    }
    return false
  }

  // utility: normalize character name for lookup (remove diacritics, trim, lowercase)
  const stripName = (s: string) => (s || '').toString().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()

  // iLevel lookup removed

  // noop: simc filter handled in Dashboard

  return (
    <div className="tab-content">
      <div className="card tab-card wishlist-card" style={{ padding: '24px 20px', gap: 14 }}>
        <h3 className="wishlist-title">{t('wishlist.title')}</h3>

        {error && <div className="wishlist-error">{error}</div>}

        {initialLoading && <Spinner size={40} />}
        {!initialLoading && (
        <>
        <div className="wishlist-toolbar">
          <input
            type="text"
            placeholder={t('wishlist.search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="wishlist-search"
          />
          <button
            onClick={() => {
              sessionStorage.removeItem('fairloot_wishlist_cache');
              setInitialLoading(true);
              fetchData(true);
            }}
            className="wishlist-refresh-btn"
          >🔄 Atualizar wishlist</button>
          {raids.length > 1 && (
            <select
              value={selectedRaid}
              onChange={e => setSelectedRaid(e.target.value)}
              className="wishlist-raid-select"
            >
              <option value="">{t('wishlist.allRaids')}</option>
              {raids.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          <div className="wishlist-simc-toggles">
            <span className="wishlist-simc-label">SimC:</span>
            {orderedDiffs.map(d => (
              <button
                key={d}
                className={`wishlist-simc-btn ${simcDiffs.has(d) ? 'active' : ''}`}
                style={{ borderColor: simcDiffs.has(d) ? diffColor(d) : undefined }}
                onClick={() => toggleSimcDiff(d)}
                title={`SimC ${d}`}
              >
                {d.charAt(0).toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="wishlist-count">
          {filtered.length} {filtered.length !== 1 ? t('wishlist.players') : t('wishlist.player')}
        </div>

        {/* Character list */}
        <div className="wishlist-list">
          {filtered.length === 0 && <EmptyState icon="🔍" message={t('wishlist.noPlayer')} />}
          {filtered.map((c, idx) => {
            const isExpanded = expandedChars.has(c.name)
            const charInstances = getInstancesForChar(c)
            const nameColor = getClassColor(c.class, theme)
            const nameKey = stripName(c.name || '')

            return (
              <div key={idx} className={`wishlist-char ${isExpanded ? 'wishlist-char--expanded' : ''}`}>
                {/* Header row */}
                <div className="wishlist-char-header" onClick={() => toggleChar(c.name)}>
                  <div className="wishlist-char-left">
                    <span className="wishlist-expand-arrow" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)' }}>▶</span>
                    <strong className="wishlist-char-name class-color-text" style={{ color: nameColor }}>{c.name}</strong>
                  </div>
                  <div className="wishlist-char-right">
                    {/* iLevel badges removed */}
                    {simcDiffs.size > 0 && (
                      <div className="wishlist-simc-badges" style={{ marginRight: 8 }}>
                        {orderedDiffs.filter(d => simcDiffs.has(d)).map(d => {
                          const has = hasSimcForDiff(c, d)
                          return (
                            <span key={d} className={`wishlist-simc-badge ${has ? 'ok' : 'fail'}`} title={`SimC ${d}: ${has ? '✓' : '✗'}`}>
                              {d.charAt(0).toUpperCase()} {has ? '✓' : '✗'}
                            </span>
                          )
                        })}
                      </div>
                    )}
                    {/* iLevel value removed */}
                    <span className="wishlist-realm">{c.realm}</span>
                    <span className="wishlist-overall" style={{ color: percColor(c.overallPercentage), marginLeft: 8 }}>
                      {c.overallPercentage.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Expanded: 3-column layout per raid */}
                {isExpanded && (
                  <div className="wishlist-expanded">
                    {charInstances.map((inst, ii) => {
                      const diffMap = new Map<string, Difficulty>()
                      for (const d of inst.difficulties) diffMap.set(d.difficulty.toLowerCase(), d)
                      return (
                        <div key={ii}>
                          {(raids.length > 1 || !selectedRaid) && (
                            <div className="wishlist-raid-name">{inst.name}</div>
                          )}
                          <div className="wishlist-diff-grid">
                            {orderedDiffs.map(diffKey => {
                              const d = diffMap.get(diffKey)
                              return (
                                <div key={diffKey} className={`wishlist-diff-col ${!d ? 'wishlist-diff-col--empty' : ''}`}>
                                  <div className="wishlist-diff-header">
                                    <span className="wishlist-diff-label" style={{ color: diffColor(diffKey) }}>
                                      {diffKey}
                                    </span>
                                    {d && <span className="wishlist-diff-pct">{d.totalPercentage.toFixed(1)}%</span>}
                                  </div>
                                  {d ? (
                                    <div className="wishlist-encounters">
                                      {d.encounters.map((e, j) => {
                                        const activeItems = e.items.filter(it => (it.percentage ?? 0) > 0)
                                        if (activeItems.length === 0) return null
                                        return (
                                          <div key={j}>
                                            <div className="wishlist-enc-header">
                                              <span className="wishlist-enc-name">{e.name}</span>
                                              <span className="wishlist-enc-pct" style={{ color: percColor(e.encounterPercentage) }}>{e.encounterPercentage > 0 ? `${e.encounterPercentage.toFixed(1)}%` : ''}</span>
                                            </div>
                                            <div className="wishlist-items">
                                              {activeItems.map((it, k) => (
                                                <div key={k} className="wishlist-item">
                                                  {it.icon && <img src={it.icon} alt="" className="wishlist-item-icon" onError={ev => { (ev.currentTarget as HTMLImageElement).style.display = 'none' }} />}
                                                  <span className="wishlist-item-name">{it.name}</span>
                                                  <span className="wishlist-item-pct" style={{ color: percColor(it.percentage ?? 0) }}>{(it.percentage ?? 0).toFixed(1)}%</span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  ) : (
                                    <div className="wishlist-diff-empty">—</div>
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
        </>
        )}
      </div>
    </div>
  )
}
