import React, { useEffect, useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { isDemoMode, getOutdatedWarnings, getDemoLootHistory, getDemoCharacters } from '../services/demoData'
import api from '../services/api'
import { getClassIconUrl, getClassColor } from '../services/classIcons'
import './Dashboard.scss'

const v1Features = [
  { icon: '🎯', titleKey: 'dash.feat.loot' as const, descKey: 'dash.feat.lootDesc' as const },
  { icon: '📋', titleKey: 'dash.feat.wishlist' as const, descKey: 'dash.feat.wishlistDesc' as const },
  { icon: '⚖️', titleKey: 'dash.feat.priority' as const, descKey: 'dash.feat.priorityDesc' as const },
  { icon: '📜', titleKey: 'dash.feat.history' as const, descKey: 'dash.feat.historyDesc' as const },
  { icon: '👥', titleKey: 'dash.feat.members' as const, descKey: 'dash.feat.membersDesc' as const },
  { icon: '🌐', titleKey: 'dash.feat.i18n' as const, descKey: 'dash.feat.i18nDesc' as const },
]

const changelog = [
  {
    version: 'v2.1.0',
    date: 'Abr 2026',
    items: [
      'Removido suporte a iLevel (inputs/UI e persistência no banco) por decisão do produto',
      'Filtro SimC aprimorado: multi-select N/H/M, persistente entre sessões, com UI colorida',
      'Dashboard: detecção e listagem de SimC desatualizado refinada e mais confiável',
      'Correções e limpeza de código relacionadas à integração WowAudit/Blizzard',
    ],
  },
  {
    version: 'v2.0.0',
    date: 'Abr 2026',
    items: [
      'Dashboard mostra jogadores com SimC desatualizado, com ícone da classe e dificuldades afetadas',
      'Histórico de novidades do sistema direto no painel',
      'Melhorias de layout e responsividade em todas as telas',
      'Refinamentos no fluxo de distribuição de loot',
    ],
  },
  {
    version: 'v1.0.0',
    date: 'Mar 2026',
    items: [
      'Controle de loot com sugestões automáticas de distribuição',
      'Integração com WowAudit (wishlists e personagens)',
      'Algoritmo de prioridade com 3 fatores configuráveis (α, β, γ)',
      'Detecção automática de transmog',
      'Histórico completo de distribuições com opção de reverter',
      'Gestão de membros com aprovação e roles',
      'Suporte a Português e Inglês, tema claro e escuro',
    ],
  },
]

export default function Dashboard() {
  const { t, theme } = useApp()
  const [outdated, setOutdated] = useState<{ name: string; diffs: string[]; lastOutdatedTs?: number; className?: string }[]>([])
  const [allOutdated, setAllOutdated] = useState<{ name: string; diffs: string[]; lastOutdatedTs?: number; className?: string }[]>([])
  const [simcFilter, setSimcFilter] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('outdatedSimcFilter')
      if (raw) {
        const arr = JSON.parse(raw) as string[]
        const normalized = arr.map(v => {
          const s = (v || '').toString().trim().toLowerCase()
          if (s === 'n' || s === 'normal') return 'normal'
          if (s === 'h' || s === 'heroic') return 'heroic'
          if (s === 'm' || s === 'mythic') return 'mythic'
          return s
        }).filter(x => x)
        return new Set<string>(normalized)
      }
    } catch {}
    return new Set<string>()
  })
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [lootByPlayer, setLootByPlayer] = useState<{ name: string; count: number; className?: string }[]>([])
  const [timeline, setTimeline] = useState<{ date: string; count: number }[]>([])
  const [seasonStart, setSeasonStart] = useState<string | null>(null)

  // no auto-advance — user prefers manual control

  useEffect(() => {
    const load = async () => {
      if (isDemoMode()) {
        // demo helper returns enriched warnings; map into expected shape
        const demo = getOutdatedWarnings()
        const mapped = demo.map(d => ({ name: d.name, diffs: ['unknown'], lastOutdatedTs: d.lastOutdatedTs, className: d.className }))
        const sorted = mapped.sort((a, b) => b.diffs.length - a.diffs.length || a.name.localeCompare(b.name))
        setAllOutdated(sorted)
        // rehydrate filter from localStorage (ensure normalized values) and apply
        try {
          const raw = localStorage.getItem('outdatedSimcFilter')
          if (raw) {
            const arr = JSON.parse(raw) as string[]
            const normalized = arr.map(v => {
              const s = (v || '').toString().trim().toLowerCase()
              if (s === 'n' || s === 'normal') return 'normal'
              if (s === 'h' || s === 'heroic') return 'heroic'
              if (s === 'm' || s === 'mythic') return 'mythic'
              return s
            }).filter(x => x)
            const set = new Set<string>(normalized)
            setSimcFilter(set)
            if (set.size > 0) setOutdated(sorted.filter(w => w.diffs.some(d => set.has(d))))
            else setOutdated(sorted)
          } else {
            setOutdated(sorted)
          }
        } catch {
          setOutdated(sorted)
        }
      } else {
        try {
          const [r, charsRes] = await Promise.all([
            api.get('/api/guild/wowaudit/wishlists').catch(() => ({ data: {} })),
            api.get('/api/guild/characters').catch(() => ({ data: [] })),
          ])
          const characters = r.data?.raw?.characters || []
          const dbChars = charsRes.data || []
          const classMap: Record<string, string> = {}
          for (const dc of dbChars) { if (dc && dc.name && dc.class) classMap[dc.name] = dc.class }

          const warnings: { name: string; diffs: string[]; lastOutdatedTs?: number; className?: string }[] = []
          for (const c of characters) {
            const diffsSet = new Set<string>()
            let latestOutdatedTs: number | undefined
            for (const inst of (c.instances || [])) {
              for (const diff of (inst.difficulties || [])) {
                const rawName = (diff.difficulty || '').toString().trim().toLowerCase()
                const diffName = ((): string => {
                  if (!rawName) return 'unknown'
                  if (rawName.includes('myth')) return 'mythic'
                  if (rawName.includes('hero')) return 'heroic'
                  return 'normal'
                })()
                const wl = diff.wishlist || {}
                // also consider wishlist-level timestamps
                if (wl.updated_at) {
                  for (const tsVal of Object.values(wl.updated_at)) {
                    if (tsVal) {
                      const ts = new Date(tsVal as string).getTime()
                      if (!isNaN(ts)) latestOutdatedTs = Math.max(latestOutdatedTs || 0, ts)
                    }
                  }
                }
                for (const enc of (wl.encounters || [])) {
                  for (const item of (enc.items || [])) {
                    for (const wish of (item.wishes || [])) {
                      if (wish.outdated && wish.outdated.old && wish.outdated.new) {
                        diffsSet.add(diffName || 'unknown')
                        if (wish.timestamp) {
                          const ts = new Date(wish.timestamp).getTime()
                          if (!isNaN(ts)) latestOutdatedTs = Math.max(latestOutdatedTs || 0, ts)
                        }
                      }
                    }
                  }
                }
              }
            }
            if (diffsSet.size > 0) warnings.push({ name: c.name, diffs: Array.from(diffsSet), lastOutdatedTs: latestOutdatedTs, className: classMap[c.name] })
          }
          // sort by number of difficulties affected (desc) then name
          const sorted = warnings.sort((a, b) => b.diffs.length - a.diffs.length || a.name.localeCompare(b.name))
          setAllOutdated(sorted)
          if (simcFilter.size > 0) setOutdated(sorted.filter(w => w.diffs.some(d => simcFilter.has(d))))
          else setOutdated(sorted)
        } catch {}
      }
    }
    load()
  }, [])

  // Fetch loot history + characters for chart
  useEffect(() => {
    const loadChart = async () => {
      try {
        let drops: any[] = []
        let allChars: any[] = []
        let seasonCutoff = 0

        if (isDemoMode()) {
          drops = getDemoLootHistory()
          allChars = getDemoCharacters()
          // check demo seasons
          const savedSeasons = sessionStorage.getItem('demoSeasons')
          if (savedSeasons) {
            const seasons = JSON.parse(savedSeasons)
            if (seasons.length > 0) {
              const latest = seasons.sort((a: any, b: any) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime())[0]
              seasonCutoff = new Date(latest.endedAt).getTime()
            }
          }
        } else {
          const [r, charsRes, seasonsRes] = await Promise.all([
            api.get('/api/loot/history').catch(() => ({ data: [] })),
            api.get('/api/guild/characters').catch(() => ({ data: [] })),
            api.get('/api/guild/seasons').catch(() => ({ data: [] })),
          ])
          drops = r.data || []
          allChars = charsRes.data || []
          const seasons = seasonsRes.data || []
          if (seasons.length > 0) {
            seasonCutoff = new Date(seasons[0].endedAt).getTime()
          }
        }

        // filter to current season
        const current = drops.filter((d: any) => d.assignedTo && !d.isReverted && new Date(d.createdAt).getTime() > seasonCutoff)

        // count per player
        const countMap: Record<string, number> = {}
        const classMap: Record<string, string> = {}
        for (const c of allChars) {
          if (c.name) {
            countMap[c.name] = 0
            if (c.class) classMap[c.name] = c.class
          }
        }
        for (const d of current) {
          countMap[d.assignedTo] = (countMap[d.assignedTo] || 0) + 1
          if (!classMap[d.assignedTo] && d.className) classMap[d.assignedTo] = d.className
        }

        const sorted = Object.entries(countMap)
          .map(([name, count]) => ({ name, count, className: classMap[name] }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        setLootByPlayer(sorted)

        // timeline: group by date
        const dateMap: Record<string, number> = {}
        for (const d of current) {
          const dateKey = new Date(d.createdAt).toLocaleDateString()
          dateMap[dateKey] = (dateMap[dateKey] || 0) + 1
        }
        const tl = Object.entries(dateMap)
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        setTimeline(tl)

        // season start date
        if (current.length > 0) {
          const earliest = current.reduce((min: any, d: any) => new Date(d.createdAt).getTime() < new Date(min.createdAt).getTime() ? d : min, current[0])
          setSeasonStart(new Date(earliest.createdAt).toLocaleDateString())
        }
      } catch {}
    }
    loadChart()
  }, [])

  // persist filter changes
  useEffect(() => {
    try { localStorage.setItem('outdatedSimcFilter', JSON.stringify(Array.from(simcFilter))) } catch {}
    // when filter changes, re-apply to the full computed list
    if (allOutdated.length > 0) {
      if (simcFilter.size > 0) setOutdated(allOutdated.filter(w => w.diffs.some(d => simcFilter.has(d))))
      else setOutdated(allOutdated)
    }
  }, [simcFilter, allOutdated])

  // ensure stored filter is applied after allOutdated is populated (handles page refresh)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('outdatedSimcFilter')
      if (!raw) return
      const arr = JSON.parse(raw) as string[]
      const normalized = arr.map(v => {
        const s = (v || '').toString().trim().toLowerCase()
        if (s === 'n' || s === 'normal') return 'normal'
        if (s === 'h' || s === 'heroic') return 'heroic'
        if (s === 'm' || s === 'mythic') return 'mythic'
        return s
      }).filter(x => x)
      const stored = new Set<string>(normalized)
      setSimcFilter(stored)
      if (allOutdated.length > 0) {
        if (stored.size > 0) setOutdated(allOutdated.filter(w => w.diffs.some(d => stored.has(d))))
        else setOutdated(allOutdated)
      }
    } catch {}
  }, [allOutdated])

  const maxLoot = useMemo(() => Math.max(...lootByPlayer.map(p => p.count), 1), [lootByPlayer])

  return (
    <div className="tab-content">
      <div className="card tab-card dash-card">
        <h2 className="dash-welcome">{t('dash.welcome')}</h2>
        <p className="dash-subtitle">{t('dash.subtitle')}</p>

        {/* Loot distribution chart */}
        {lootByPlayer.length > 0 && (
          <div className="dash-chart-section">
            <h3 className="dash-chart-title">{t('dash.chartTitle')}</h3>
            {seasonStart && (
              <div className="dash-chart-since">{t('dash.chartSince')} {seasonStart}</div>
            )}
            <div className="dash-chart">
              {lootByPlayer.map((p, i) => {
                const barColor = getClassColor(p.className, theme)
                return (
                  <div key={i} className="dash-chart-row">
                    <div className="dash-chart-name" title={p.name}>{p.name}</div>
                    <div className="dash-chart-bar-track">
                      <div
                        className="dash-chart-bar"
                        style={{
                          width: `${(p.count / maxLoot) * 100}%`,
                          animationDelay: `${i * 50}ms`,
                          background: barColor,
                        }}
                      />
                    </div>
                    <div className="dash-chart-value">{p.count}</div>
                  </div>
                )
              })}
            </div>
            {/* Timeline */}
            {timeline.length > 1 && (
              <div className="dash-timeline">
                <div className="dash-timeline-title">{t('dash.chartTimeline')}</div>
                <div className="dash-timeline-track">
                  {timeline.map((tp, i) => (
                    <div key={i} className="dash-timeline-point" title={`${tp.date}: ${tp.count}`}>
                      <div className="dash-timeline-bar" style={{ height: `${Math.max(8, (tp.count / Math.max(...timeline.map(x => x.count))) * 40)}px` }} />
                      <div className="dash-timeline-label">{tp.date.replace(/\/\d{4}$/, '').replace(/\/20\d{2}$/, '')}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Outdated SimC Warnings — first thing after welcome */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 className="outdated-title" style={{ margin: 0 }}>{t('dash.outdatedTitle')}</h3>
            <p className="outdated-desc" style={{ margin: '0 0 0 12px' }}>{t('dash.outdatedDesc')}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, color: 'var(--muted)', marginRight: 6 }}>SimC:</label>
            {['normal','heroic','mythic'].map(d => {
              const key = d
              const label = d === 'normal' ? 'N' : d === 'heroic' ? 'H' : 'M'
              const active = simcFilter.has(key)
              const color = key === 'normal' ? 'var(--color-green)' : key === 'heroic' ? 'var(--color-heroic)' : 'var(--color-mythic)'
              return (
                <button
                  key={key}
                  onClick={() => {
                    // allow multi-select: toggle presence of this difficulty in the filter
                    setSimcFilter(prev => {
                      const next = new Set(prev)
                      if (next.has(key)) next.delete(key)
                      else next.add(key)
                      return next
                    })
                  }}
                  style={{
                    minWidth: 34,
                    height: 30,
                    borderRadius: 8,
                    border: active ? `1px solid ${color}` : '1px solid var(--border)',
                    background: active ? 'rgba(255,255,255,0.03)' : 'transparent',
                    color: active ? color : 'var(--muted)',
                    cursor: 'pointer',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title={d}
                >{label}</button>
              )
            })}
          </div>
        </div>
        {outdated.length > 0 && (
          <div className="outdated-section">
            <h3 className="outdated-title">{t('dash.outdatedTitle')}</h3>
            <p className="outdated-desc">{t('dash.outdatedDesc')}</p>
            <div className="outdated-grid">
              {outdated.map((w, i) => {
                const daysAgo = w.lastOutdatedTs ? Math.max(1, Math.floor((Date.now() - w.lastOutdatedTs) / (1000*60*60*24))) : null
                const classIcon = getClassIconUrl(w.className)
                return (
                  <div key={i} className="outdated-card">
                    <div className="outdated-top">
                      {classIcon ? (
                        <img src={classIcon} alt={w.className || ''} className="outdated-class-icon" draggable={false} />
                      ) : (
                        <div className="outdated-class-icon outdated-class-icon--empty" />
                      )}
                      <div className="outdated-name">{w.name}</div>
                    </div>
                    <div className="outdated-bottom">
                      <div className="outdated-badges">
                        {w.diffs.map((d, di) => (
                          <span key={di} className={`badge badge-diff badge-diff--${d}`}>{d ? d.toUpperCase() : 'UNK'}</span>
                        ))}
                      </div>
                      {daysAgo !== null && (
                        <div className="outdated-days">{daysAgo} {daysAgo === 1 ? t('dash.outdatedDay') : t('dash.outdatedDays')}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* v1 Features */}
        <div className="dash-features-section">
          <h3 className="dash-features-title">{t('dash.featTitle')}</h3>
          <div className="features-grid">
            {v1Features.map((f, i) => (
              <div key={i} className="feature-card">
                <span className="feature-icon">{f.icon}</span>
                <div className="feature-text">
                  <div className="feature-title">{t(f.titleKey)}</div>
                  <div className="feature-desc">{t(f.descKey)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Changelog carousel */}
        <div className="changelog-section">
          <h3 className="changelog-title">{t('dash.changelog')}</h3>
          <div className="carousel">
            <button className="carousel-btn" onClick={() => setCarouselIndex((carouselIndex - 1 + changelog.length) % changelog.length)}>‹</button>
            <div className="carousel-item">
              <div className="carousel-version-row">
                <span className="carousel-version">{changelog[carouselIndex].version}</span>
                <span className="carousel-date">{changelog[carouselIndex].date}</span>
              </div>
              <ul className="carousel-list">
                {changelog[carouselIndex].items.map((item, ii) => (
                  <li key={ii}>{item}</li>
                ))}
              </ul>
            </div>
            <button className="carousel-btn" onClick={() => setCarouselIndex((carouselIndex + 1) % changelog.length)}>›</button>
          </div>
          <div className="carousel-dots">
            {changelog.map((_, i) => (
              <button key={i} className={`dot ${i === carouselIndex ? 'active' : ''}`} onClick={() => setCarouselIndex(i)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
