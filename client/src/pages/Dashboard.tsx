import React, { useEffect, useState, useMemo, useRef } from 'react'
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
  const [pageSlide, setPageSlide] = useState(0)
  const [lootByPlayer, setLootByPlayer] = useState<{ name: string; count: number; manualCount: number; transmogCount: number; className?: string }[]>([])
  // multiple views can be shown at once (each renders its own bar segment) instead of switching between them
  const [chartViews, setChartViews] = useState<Set<'score' | 'transmog' | 'noscore'>>(new Set(['score']))
  const [chartSortDir, setChartSortDir] = useState<'asc' | 'desc'>('desc')
  const toggleChartView = (v: 'score' | 'transmog' | 'noscore') => {
    setChartViews(prev => {
      // keep at least one view active — an empty chart would just be confusing
      if (prev.has(v) && prev.size === 1) return prev
      const next = new Set(prev)
      if (next.has(v)) next.delete(v); else next.add(v)
      return next
    })
  }
  const [timeline, setTimeline] = useState<{ date: string; count: number }[]>([])
  const [seasonStart, setSeasonStart] = useState<string | null>(null)
  const [seasonDrops, setSeasonDrops] = useState<any[]>([])
  const [seasonChars, setSeasonChars] = useState<any[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

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

        // count per player — scored, transmog, and manually-assigned (no-score) items tracked separately
        const countMap: Record<string, number> = {}
        const manualCountMap: Record<string, number> = {}
        const transmogCountMap: Record<string, number> = {}
        const classMap: Record<string, string> = {}
        for (const c of allChars) {
          if (c.name) {
            countMap[c.name] = 0
            manualCountMap[c.name] = 0
            transmogCountMap[c.name] = 0
            if (c.class) classMap[c.name] = c.class
          }
        }
        for (const d of current) {
          if (d.isTransmogPick) {
            transmogCountMap[d.assignedTo] = (transmogCountMap[d.assignedTo] || 0) + 1
          } else if (d.isManualAssignment) {
            manualCountMap[d.assignedTo] = (manualCountMap[d.assignedTo] || 0) + 1
          } else {
            countMap[d.assignedTo] = (countMap[d.assignedTo] || 0) + 1
          }
          if (!classMap[d.assignedTo] && d.className) classMap[d.assignedTo] = d.className
        }

        const sorted = Object.entries(countMap)
          .map(([name, count]) => ({ name, count, manualCount: manualCountMap[name] || 0, transmogCount: transmogCountMap[name] || 0, className: classMap[name] }))
          .sort((a, b) => (b.count + b.manualCount + b.transmogCount) - (a.count + a.manualCount + a.transmogCount) || a.name.localeCompare(b.name))
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

        // keep the raw season drops + roster around so clicking a timeline day can re-aggregate just that day
        setSeasonDrops(current)
        setSeasonChars(allChars)
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

  // clicking a timeline day re-aggregates the chart to just that day's recipients instead of the whole season
  const displayedPlayers = useMemo(() => {
    if (!selectedDate) return lootByPlayer
    const dayDrops = seasonDrops.filter((d: any) => new Date(d.createdAt).toLocaleDateString() === selectedDate)
    const countMap: Record<string, number> = {}
    const manualCountMap: Record<string, number> = {}
    const transmogCountMap: Record<string, number> = {}
    const classMap: Record<string, string> = {}
    for (const c of seasonChars) { if (c.name && c.class) classMap[c.name] = c.class }
    for (const d of dayDrops) {
      if (d.isTransmogPick) transmogCountMap[d.assignedTo] = (transmogCountMap[d.assignedTo] || 0) + 1
      else if (d.isManualAssignment) manualCountMap[d.assignedTo] = (manualCountMap[d.assignedTo] || 0) + 1
      else countMap[d.assignedTo] = (countMap[d.assignedTo] || 0) + 1
      if (!classMap[d.assignedTo] && d.className) classMap[d.assignedTo] = d.className
    }
    const names = new Set([...Object.keys(countMap), ...Object.keys(manualCountMap), ...Object.keys(transmogCountMap)])
    return Array.from(names)
      .map(name => ({ name, count: countMap[name] || 0, manualCount: manualCountMap[name] || 0, transmogCount: transmogCountMap[name] || 0, className: classMap[name] }))
      .sort((a, b) => (b.count + b.manualCount + b.transmogCount) - (a.count + a.manualCount + a.transmogCount) || a.name.localeCompare(b.name))
  }, [selectedDate, seasonDrops, seasonChars, lootByPlayer])

  type ChartPlayer = { name: string; count: number; manualCount: number; transmogCount: number; className?: string }
  const CHART_VIEW_ORDER: ('score' | 'transmog' | 'noscore')[] = ['score', 'transmog', 'noscore']
  const metricFor = (p: ChartPlayer, v: 'score' | 'transmog' | 'noscore') =>
    v === 'transmog' ? p.transmogCount : v === 'noscore' ? p.manualCount : p.count
  const chartSum = (p: ChartPlayer) => CHART_VIEW_ORDER.reduce((acc, v) => acc + (chartViews.has(v) ? metricFor(p, v) : 0), 0)
  const chartRows = useMemo(() => {
    const dir = chartSortDir === 'asc' ? 1 : -1
    return displayedPlayers
      .filter(p => chartSum(p) > 0)
      .sort((a, b) => dir * (chartSum(a) - chartSum(b)) || a.name.localeCompare(b.name))
  }, [displayedPlayers, chartViews, chartSortDir])
  const maxLoot = useMemo(() => Math.max(...chartRows.map(p => chartSum(p)), 1), [chartRows, chartViews])

  // reserve the tallest height the row list has ever needed — filtering to a single day (or to a
  // view with fewer participants) shouldn't collapse this area and yank the timeline up with it.
  const chartListRef = useRef<HTMLDivElement>(null)
  const [chartMinHeight, setChartMinHeight] = useState(0)
  useEffect(() => {
    const el = chartListRef.current
    if (!el) return
    setChartMinHeight(h => Math.max(h, el.scrollHeight))
  }, [chartRows])

  const slideCount = 3
  const goSlide = (i: number) => setPageSlide((i + slideCount) % slideCount)

  // draggable tab order — persisted per browser so it's independent of the fixed slide content order
  const [tabOrder, setTabOrder] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('dashTabOrder')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length === slideCount && new Set(parsed).size === slideCount && parsed.every((n: any) => Number.isInteger(n) && n >= 0 && n < slideCount)) {
          return parsed
        }
      }
    } catch {}
    return [0, 1, 2]
  })
  const [draggedTabPos, setDraggedTabPos] = useState<number | null>(null)
  const [dragOverTabPos, setDragOverTabPos] = useState<number | null>(null)
  const reorderTab = (fromPos: number, toPos: number) => {
    if (fromPos === toPos) return
    setTabOrder(prev => {
      const next = [...prev]
      const [moved] = next.splice(fromPos, 1)
      next.splice(toPos, 0, moved)
      try { localStorage.setItem('dashTabOrder', JSON.stringify(next)) } catch {}
      return next
    })
  }

  // switching to a shorter slide shouldn't leave the view scrolled past its top (e.g. after
  // scrolling down to reach the nav dots on a tall slide)
  useEffect(() => {
    document.querySelector('.container')?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [pageSlide])

  // the 3 slides have very different heights — without this, the carousel would always reserve
  // the tallest slide's height, leaving a big empty gap (and the nav far away) on the shorter ones.
  // ResizeObserver also catches height changes from async data (chart/outdated list loading in).
  const slide1Ref = useRef<HTMLDivElement>(null)
  const slide2Ref = useRef<HTMLDivElement>(null)
  const slide3Ref = useRef<HTMLDivElement>(null)
  const [trackHeight, setTrackHeight] = useState<number | undefined>(undefined)
  useEffect(() => {
    const el = [slide1Ref, slide2Ref, slide3Ref][pageSlide].current
    if (!el) return
    const update = () => setTrackHeight(el.scrollHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [pageSlide])

  return (
    <div className="tab-content">
      <div className="tab-card dash-card">
        <div className="dash-page-nav">
          {tabOrder.map((slideIdx, pos) => {
            const label = [t('dash.navDashboard'), t('dash.outdatedTitle'), t('dash.navHome')][slideIdx]
            return (
              <button
                key={slideIdx}
                draggable
                onDragStart={() => setDraggedTabPos(pos)}
                onDragOver={e => { e.preventDefault(); if (dragOverTabPos !== pos) setDragOverTabPos(pos) }}
                onDragLeave={() => setDragOverTabPos(prev => prev === pos ? null : prev)}
                onDrop={e => {
                  e.preventDefault()
                  if (draggedTabPos !== null) reorderTab(draggedTabPos, pos)
                  setDraggedTabPos(null)
                  setDragOverTabPos(null)
                }}
                onDragEnd={() => { setDraggedTabPos(null); setDragOverTabPos(null) }}
                className={`dash-page-tab ${slideIdx === pageSlide ? 'active' : ''} ${draggedTabPos === pos ? 'dragging' : ''} ${dragOverTabPos === pos && draggedTabPos !== pos ? 'drag-over' : ''}`}
                onClick={() => goSlide(slideIdx)}
                title={t('dash.navDragHint')}
              >
                {label}
              </button>
            )
          })}
        </div>

        <div className="dash-carousel" style={{ height: trackHeight }}>
          <div className="dash-carousel-track" style={{ transform: `translateX(-${tabOrder.indexOf(pageSlide) * 100}%)` }}>

          {/* ── Slide 1: welcome + loot chart ── */}
          <div className="dash-carousel-slide" ref={slide1Ref} style={{ order: tabOrder.indexOf(0) }}>
        {/* Loot distribution chart */}
        {lootByPlayer.length > 0 && (
          <div className="dash-chart-section">
            <div className="dash-chart-header">
              <div className="dash-chart-header-text">
                <h3 className="dash-chart-title">{t('dash.chartTitle')}</h3>
                {seasonStart && (
                  <span className="dash-chart-since">{t('dash.chartSince')} {seasonStart}</span>
                )}
              </div>
              <div className="dash-chart-view-toggle">
                <button type="button" className={`dash-chart-view-btn ${chartViews.has('score') ? 'active' : ''}`} onClick={() => toggleChartView('score')}>{t('dash.chartViewScore')}</button>
                <button type="button" className={`dash-chart-view-btn dash-chart-view-btn--transmog ${chartViews.has('transmog') ? 'active' : ''}`} title={t('dash.chartViewCaptionTransmog')} onClick={() => toggleChartView('transmog')}>{t('dash.chartViewTransmog')}</button>
                <button type="button" className={`dash-chart-view-btn dash-chart-view-btn--noscore ${chartViews.has('noscore') ? 'active' : ''}`} title={t('dash.chartNoScoreLegend')} onClick={() => toggleChartView('noscore')}>{t('dash.chartViewNoScore')}</button>
                <button
                  type="button"
                  className="dash-chart-sort-btn"
                  title={chartSortDir === 'asc' ? t('dash.chartSortAsc') : t('dash.chartSortDesc')}
                  onClick={() => setChartSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                >{chartSortDir === 'asc' ? '↑' : '↓'}</button>
              </div>
            </div>
            {/* Timeline — clicking the already-active day clears the filter, shown via its own "✕" prefix */}
            {timeline.length > 1 && (
              <div className="dash-timeline">
                <div className="dash-timeline-track">
                  {timeline.map((tp, i) => {
                    const isSelected = selectedDate === tp.date
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`dash-timeline-point${isSelected ? ' selected' : ''}`}
                        title={isSelected ? t('dash.chartFilterClear') : `${tp.date}: ${tp.count}`}
                        onClick={() => setSelectedDate(isSelected ? null : tp.date)}
                      >
                        {isSelected && '✕ '}{tp.date.replace(/\/\d{4}$/, '').replace(/\/20\d{2}$/, '')}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="dash-chart" ref={chartListRef} style={{ minHeight: chartMinHeight || undefined }}>
              {chartRows.length === 0 && (
                <div className="dash-chart-empty">{t('dash.chartNoData')}</div>
              )}
              {chartRows.map((p, i) => {
                const segments = CHART_VIEW_ORDER
                  .filter(v => chartViews.has(v))
                  .map(v => ({
                    view: v,
                    value: metricFor(p, v),
                    color: v === 'transmog' ? 'var(--color-transmog)' : v === 'noscore' ? 'var(--color-noscore)' : getClassColor(p.className, theme),
                  }))
                const label = segments.map(s => s.value).filter(v => v > 0).join(' + ')
                return (
                  <div key={i} className="dash-chart-row">
                    <div className="dash-chart-name" title={p.name}>{p.name}</div>
                    <div className="dash-chart-bar-track">
                      {segments.map(s => s.value > 0 && (
                        <div
                          key={s.view}
                          className="dash-chart-bar"
                          style={{
                            width: `${(s.value / maxLoot) * 100}%`,
                            animationDelay: `${i * 50}ms`,
                            background: s.color,
                          }}
                        />
                      ))}
                    </div>
                    <div className="dash-chart-value">{label}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
          </div>

          {/* ── Slide 2: outdated SimC ── */}
          <div className="dash-carousel-slide" ref={slide2Ref} style={{ order: tabOrder.indexOf(1) }}>
        {/* Outdated SimC Warnings — first thing after welcome */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 className="outdated-title" style={{ margin: 0 }}><span aria-hidden="true">⚠️ </span>{t('dash.outdatedTitle')}</h3>
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
            <div className="outdated-grid">
              {outdated.map((w, i) => {
                const daysAgo = w.lastOutdatedTs ? Math.max(1, Math.floor((Date.now() - w.lastOutdatedTs) / (1000*60*60*24))) : null
                const classIcon = getClassIconUrl(w.className)
                return (
                  <div key={i} className="outdated-card panel">
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
          </div>

          {/* ── Slide 3: features + changelog ── */}
          <div className="dash-carousel-slide" ref={slide3Ref} style={{ order: tabOrder.indexOf(2) }}>
        <h2 className="dash-welcome">{t('dash.welcome')}</h2>
        <p className="dash-subtitle">{t('dash.subtitle')}</p>

        {/* v1 Features */}
        <div className="dash-features-section">
          <h3 className="dash-features-title"><span aria-hidden="true">✨ </span>{t('dash.featTitle')}</h3>
          <div className="features-grid">
            {v1Features.map((f, i) => (
              <div key={i} className="feature-card panel">
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
            <div className="carousel-item panel">
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
        </div>
      </div>
    </div>
  )
}
