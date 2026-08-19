import React, { useEffect, useState, useMemo } from 'react'
import api from '../services/api'
import { useApp } from '../context/AppContext'
import Spinner from '../components/Spinner'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import './LootHistory.scss'
import { isDemoMode, getDemoLootHistory, removeDemoLootHistory, deleteDemoLootHistory, getDemoWishlistSummary, getDemoCharacters, getDemoGuild, addDemoLootHistory } from '../services/demoData'
import { getBossImageUrl, resolveBossImageAuto, resolveBossNameAuto } from '../services/bossMap'
import { getClassIconUrl, getClassColor } from '../services/classIcons'

type LootDrop = {
  id: string
  itemName: string
  itemId?: number | null
  icon?: string
  boss: string
  difficulty: string
  assignedTo: string
  awardValue: number
  note?: string
  createdAt: string
  isReverted?: boolean
  revertedAt?: string
  isManualAssignment?: boolean
}

type Candidate = {
  characterName: string
  class?: string
  itemPercentage: number
  overallScore: number
  lootReceivedCount: number
  lastLootDate?: string
  priority: number
}

type RedistributeInfo = {
  id: string
  itemName: string
  itemId?: number | null
  boss: string
  difficulty: string
  assignedTo: string
  revertedScore: number
}

export default function LootHistory() {
  const [drops, setDrops] = useState<LootDrop[]>([])
  const [error, setError] = useState<string | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const { t, lang, theme, showConfirm, showAlert } = useApp()

  // guild score ranking — visible to all roles for transparency
  const [scoreRanking, setScoreRanking] = useState<{ name: string; class?: string; score: number }[]>([])
  const [showFormula, setShowFormula] = useState(false)

  // auto-resolved boss art (Blizzard Journal API, searched by name only — history records don't store
  // which raid a drop came from) for bosses with no manual/hardcoded image
  const [autoBossImages, setAutoBossImages] = useState<Record<string, string>>({})
  const getBossImageResolved = (bossName: string) => getBossImageUrl(bossName) || autoBossImages[bossName] || null
  // auto-resolved localized (PT) boss names — WowAudit/history only ever stores English names
  const [autoBossNames, setAutoBossNames] = useState<Record<string, string>>({})
  const getBossNameResolved = (bossName: string) => (lang === 'pt' && autoBossNames[bossName]) || bossName

  // filters
  const [filterPlayer, setFilterPlayer] = useState('')
  const [filterBoss, setFilterBoss] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [showReverted, setShowReverted] = useState(true)

  // season selector
  const [seasons, setSeasons] = useState<{ id: string; name: string; startedAt: string; endedAt: string; drops?: any[] }[]>([])
  const [selectedSeason, setSelectedSeason] = useState<string>('current')

  // redistribute panel
  const [redistributeInfo, setRedistributeInfo] = useState<RedistributeInfo | null>(null)
  const [redistCandidates, setRedistCandidates] = useState<Candidate[]>([])
  const [redistSelected, setRedistSelected] = useState('')
  const [redistLoading, setRedistLoading] = useState(false)
  const [redistSingleUpgrade, setRedistSingleUpgrade] = useState(false)
  // full roster, for the manual fallback when the intended recipient isn't in the suggestion list
  const [chars, setChars] = useState<any[]>([])
  const [redistManualChar, setRedistManualChar] = useState('')
  const [redistManualMode, setRedistManualMode] = useState<'score' | 'noscore' | 'transmog'>('noscore')

  // pagination
  const PAGE_SIZE = 20
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // icon cache
  const [iconMap, setIconMap] = useState<Record<number, string>>({})

  const resolveIcons = async (itemIds: number[]) => {
    const missing = itemIds.filter(id => id && !iconMap[id])
    if (missing.length === 0) return
    try {
      const res = await api.post('/api/loot/icons', missing)
      const data = res.data as Record<number, string | null>
      const newMap = { ...iconMap }
      for (const [k, v] of Object.entries(data)) {
        if (v) newMap[Number(k)] = v
      }
      setIconMap(newMap)
    } catch {}
  }

  const fetchSeasons = async () => {
    try {
      if (isDemoMode()) {
        const saved = sessionStorage.getItem('demoSeasons')
        setSeasons(saved ? JSON.parse(saved) : [])
      } else {
        const r = await api.get('/api/guild/seasons')
        setSeasons(r.data || [])
      }
    } catch {}
  }

  const fetchHistory = async (seasonId?: string) => {
    try {
      if (isDemoMode()) {
        let h: any[]
        if (seasonId && seasonId !== 'current') {
          // load archived season drops
          const saved = sessionStorage.getItem('demoSeasons')
          const allSeasons = saved ? JSON.parse(saved) : []
          const season = allSeasons.find((s: any) => s.id === seasonId)
          h = season?.drops || []
        } else {
          h = getDemoLootHistory()
        }
        setDrops(h)
        setIsAdmin(true)
        // resolve icons for demo history
        const ids = h.map((d: any) => d.itemId).filter((id: any) => id != null) as number[]
        if (ids.length > 0) resolveIcons(ids)
      } else {
        const url = seasonId && seasonId !== 'current' ? `/api/loot/history?seasonId=${seasonId}` : '/api/loot/history'
        const [r, me] = await Promise.all([
          api.get(url),
          api.get('/api/auth/me').catch(() => null),
        ])
        const data = r.data || []
        setDrops(data)
        setIsAdmin(me?.data?.role === 'Admin')
        // resolve icons
        const ids = data.map((d: any) => d.itemId).filter((id: any) => id != null) as number[]
        if (ids.length > 0) resolveIcons(ids)
      }
    } catch (err: any) {
      setError(err?.response?.data || t('history.errorFetch'))
    } finally {
      setInitialLoading(false)
    }
  }

  useEffect(() => {
    fetchSeasons()
    fetchHistory()
    if (isDemoMode()) {
      const c = getDemoCharacters()
      setChars(c)
      setScoreRanking(c.map((ch: any) => ({ name: ch.name, class: ch.class, score: ch.score ?? 0 })).sort((a, b) => b.score - a.score))
    } else {
      api.get('/api/guild/characters').then(r => {
        const list = r.data || []
        setChars(list)
        const ranking = list.map((ch: any) => ({ name: ch.name, class: ch.class, score: ch.score ?? 0 })).sort((a: any, b: any) => b.score - a.score)
        setScoreRanking(ranking)
      }).catch(() => {})
    }
  }, [])

  // reload history when season changes
  useEffect(() => {
    if (!initialLoading) {
      fetchHistory(selectedSeason)
    }
  }, [selectedSeason])

  const getIcon = (d: LootDrop) => d.icon || (d.itemId ? iconMap[d.itemId] : undefined)

  // Demo mode suggestion logic (matches Loot.tsx demoSuggest for a single item)
  const demoSuggestSingle = (itemId: number | null | undefined, itemName: string) => {
    const summary = getDemoWishlistSummary()
    const guild = getDemoGuild()
    const alpha = guild.priorityAlpha ?? 0.4
    const beta = guild.priorityBeta ?? 0.3
    const gamma = guild.priorityGamma ?? 0.3
    const demoHistory = getDemoLootHistory()
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    const recentDrops = demoHistory.filter((d: any) => d.assignedTo && !d.isReverted && new Date(d.createdAt).getTime() >= cutoff)
    const lootCountByChar: Record<string, number> = {}
    const lastLootByChar: Record<string, number> = {}
    for (const d of recentDrops) {
      lootCountByChar[d.assignedTo] = (lootCountByChar[d.assignedTo] || 0) + 1
      const ts = new Date(d.createdAt).getTime()
      if (!lastLootByChar[d.assignedTo] || ts > lastLootByChar[d.assignedTo]) lastLootByChar[d.assignedTo] = ts
    }

    const demoChars = getDemoCharacters()
    const isNewMap: Record<string, boolean> = {}
    demoChars.forEach((c: any) => { isNewMap[c.name] = !!c.isNewPlayer })

    const candidates: Candidate[] = []
    for (const ch of summary) {
      let bestPerc = 0
      if (ch.instances) {
        for (const inst of ch.instances) {
          if (!inst.difficulties) continue
          for (const d of inst.difficulties) {
            if (!d.encounters) continue
            for (const e of d.encounters) {
              if (!e.items) continue
              for (const it of e.items) {
                const match = (itemId != null && it.id != null && itemId === it.id) ||
                  (itemName && it.name && itemName.toLowerCase() === it.name.toLowerCase())
                if (match && (it.percentage ?? 0) > bestPerc) bestPerc = it.percentage ?? 0
              }
            }
          }
        }
      }
      candidates.push({
        characterName: ch.name,
        class: ch.class,
        itemPercentage: bestPerc,
        overallScore: 0,
        lootReceivedCount: lootCountByChar[ch.name] || 0,
        lastLootDate: lastLootByChar[ch.name] ? new Date(lastLootByChar[ch.name]).toISOString() : undefined,
        priority: 0,
      })
    }

    const maxItem = Math.max(...candidates.map(c => c.itemPercentage), 0)
    const scores = candidates.map(c => c.overallScore)
    const minScore = Math.min(...scores, 0)
    const maxScore = Math.max(...scores, 0)
    const scoreRange = maxScore - minScore
    const lootCounts = candidates.map(c => c.lootReceivedCount)
    const maxLC = Math.max(...lootCounts, 0)
    const minLC = Math.min(...lootCounts, 0)
    const lcRange = maxLC - minLC

    for (const c of candidates) {
      const upgradeNorm = maxItem > 0 ? c.itemPercentage / maxItem : 0
      const fairnessNorm = scoreRange > 0 ? (maxScore - c.overallScore) / scoreRange : 1.0
      const lootCountNorm = lcRange > 0 ? (maxLC - c.lootReceivedCount) / lcRange : 1.0
      c.priority = alpha * upgradeNorm + beta * fairnessNorm + gamma * lootCountNorm
      if (isNewMap[c.characterName]) c.priority *= 0.5
    }

    const sorted = candidates
      .sort((a, b) => b.priority - a.priority || b.itemPercentage - a.itemPercentage || a.overallScore - b.overallScore)
      .slice(0, 5)
    const positiveCount = sorted.filter(c => c.itemPercentage > 0).length
    return { candidates: sorted, allZeroUpgrade: positiveCount === 0, singleUpgradeOnly: positiveCount === 1 }
  }

  const undo = async (id: string) => {
    if (!(await showConfirm(t('history.undoConfirm')))) return
    try {
      let info: RedistributeInfo
      if (isDemoMode()) {
        const reverted = removeDemoLootHistory(id)
        setDrops(getDemoLootHistory())
        if (!reverted) return
        info = {
          id: reverted.id,
          itemName: reverted.itemName,
          itemId: reverted.itemId,
          boss: reverted.boss,
          difficulty: reverted.difficulty,
          assignedTo: reverted.assignedTo,
          revertedScore: reverted.awardValue || 0,
        }
      } else {
        const res = await api.post(`/api/loot/undo/${id}`)
        const data = res.data
        info = {
          id: data.id,
          itemName: data.itemName,
          itemId: data.itemId,
          boss: data.boss,
          difficulty: data.difficulty,
          assignedTo: data.assignedTo,
          revertedScore: data.revertedScore || 0,
        }
        fetchHistory()
      }
      setRedistributeInfo(info)
      setRedistSelected('')
      setRedistCandidates([])
      setRedistSingleUpgrade(false)
      setRedistManualChar('')
      setRedistManualMode('noscore')

      // fetch suggestions for the item
      setRedistLoading(true)
      try {
        if (isDemoMode()) {
          const result = demoSuggestSingle(info.itemId, info.itemName)
          setRedistCandidates(result.candidates)
          setRedistSingleUpgrade(result.singleUpgradeOnly)
          const upgrades = result.candidates.filter(c => c.itemPercentage > 0)
          if (upgrades.length > 0) setRedistSelected(upgrades[0].characterName)
        } else {
          const payload = { items: [{ itemId: info.itemId, itemName: info.itemName, count: 1 }] }
          const suggestRes = await api.post('/api/loot/suggest', payload)
          const entry = (suggestRes.data as any[])[0]
          const cands: Candidate[] = (entry?.candidates || []).map((c: any) => ({
            characterName: c.characterName,
            class: c.class,
            itemPercentage: c.itemPercentage,
            overallScore: c.overallScore,
            lootReceivedCount: c.lootReceivedCount ?? 0,
            lastLootDate: c.lastLootDate,
            priority: c.priority ?? 0,
          }))
          setRedistCandidates(cands)
          setRedistSingleUpgrade(!!entry?.singleUpgradeOnly)
          const upgrades = cands.filter(c => c.itemPercentage > 0)
          if (upgrades.length > 0) setRedistSelected(upgrades[0].characterName)
        }
      } catch (e) {
        console.error('Failed to fetch suggestions for redistribute', e)
      } finally {
        setRedistLoading(false)
      }
    } catch (err: any) {
      showAlert(err?.response?.data || t('history.errorUndo'))
    }
  }

  const doRedistribute = async () => {
    if (!redistributeInfo) return
    const usingManual = !!redistManualChar
    if (!usingManual && !redistSelected) return
    // manual + transmog mode: drop the assignee, record as a plain transmog (empty assignedTo)
    const assignedTo = usingManual
      ? (redistManualMode === 'transmog' ? '' : redistManualChar)
      : redistSelected
    const alloc = {
      itemId: redistributeInfo.itemId,
      itemName: redistributeInfo.itemName,
      assignedTo,
      boss: redistributeInfo.boss,
      difficulty: redistributeInfo.difficulty,
      isSingleUpgrade: usingManual ? false : redistSingleUpgrade,
      // 'score' mode counts like a normal pick; 'noscore'/'transmog' never score.
      isManualAssignment: usingManual && redistManualMode !== 'score',
    }
    try {
      if (isDemoMode()) {
        const drop = {
          id: `demo-${Date.now()}-0`,
          itemName: alloc.itemName,
          assignedTo: alloc.assignedTo,
          boss: alloc.boss,
          difficulty: alloc.difficulty,
          // award depends on difficulty (normal=0.5, heroic=1.0, mythic=1.5); transmog/manual-no-score never score
          awardValue: (!alloc.assignedTo || alloc.isSingleUpgrade || alloc.isManualAssignment) ? 0 : (alloc.difficulty === 'normal' ? 0.5 : alloc.difficulty === 'mythic' ? 1.5 : 1.0),
          note: '',
          isManualAssignment: alloc.isManualAssignment,
          createdAt: new Date().toISOString(),
        }
        addDemoLootHistory([drop])
        setDrops(getDemoLootHistory())
      } else {
        await api.post('/api/loot/distribute', { allocations: [alloc] })
        fetchHistory()
      }
      setRedistributeInfo(null)
      setRedistCandidates([])
      setRedistSelected('')
      setRedistManualChar('')
      setRedistManualMode('noscore')
    } catch (e) {
      console.error(e)
      showAlert(t('loot.distributeError'))
    }
  }

  // unique values for filter dropdowns
  const bosses = useMemo(() => [...new Set(drops.map(d => d.boss).filter(Boolean))].sort(), [drops])

  // prefetch boss art for any boss with no manual/hardcoded image (searched by name across all raids)
  useEffect(() => {
    if (isDemoMode()) return
    bosses.forEach(bossName => {
      if (getBossImageUrl(bossName) || autoBossImages[bossName]) return
      resolveBossImageAuto(undefined, bossName).then(url => {
        if (url) setAutoBossImages(prev => ({ ...prev, [bossName]: url }))
      })
    })
  }, [bosses.join('|')])

  useEffect(() => {
    if (isDemoMode() || lang !== 'pt') return
    bosses.forEach(bossName => {
      if (autoBossNames[bossName]) return
      resolveBossNameAuto(undefined, bossName, 'pt_BR').then(localized => {
        if (localized) setAutoBossNames(prev => ({ ...prev, [bossName]: localized }))
      })
    })
  }, [bosses.join('|'), lang])
  const dates = useMemo(() => {
    const set = new Set<string>()
    drops.forEach(d => {
      if (d.createdAt) set.add(new Date(d.createdAt).toLocaleDateString())
    })
    return [...set].sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
  }, [drops])

  // filtered drops
  const filtered = useMemo(() => {
    return drops.filter(d => {
      if (!showReverted && d.isReverted) return false
      if (filterPlayer && !(d.assignedTo || '').toLowerCase().includes(filterPlayer.toLowerCase()) && !(d.itemName || '').toLowerCase().includes(filterPlayer.toLowerCase())) return false
      if (filterBoss && d.boss !== filterBoss) return false
      if (filterDate && new Date(d.createdAt).toLocaleDateString() !== filterDate) return false
      return true
    })
  }, [drops, filterPlayer, filterBoss, filterDate, showReverted])

  // Reset pagination when filters change
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [filterPlayer, filterBoss, filterDate, showReverted])

  const paginated = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])
  const hasMore = visibleCount < filtered.length

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const deleteRecord = async (id: string) => {
    if (!(await showConfirm(t('history.deleteConfirm'), true))) return
    try {
      if (isDemoMode()) {
        deleteDemoLootHistory(id)
      } else {
        await api.delete(`/api/loot/${id}`)
      }
      setDrops(prev => prev.filter(d => d.id !== id))
    } catch (err: any) {
      showAlert(err?.response?.data || 'Error deleting record')
    }
  }

  const upgradeCandidates = redistCandidates.filter(c => c.itemPercentage > 0)

  const showRevertedLabel = (() => {
    const key = 'history.showReverted'
    const txt = t(key)
    if (typeof txt === 'string' && txt !== key && txt.trim() !== '') return txt
    return lang === 'pt' ? 'Mostrar revertidos' : 'Show reverted'
  })()

  return (
    <div className="tab-content">
      <div className="tab-card" style={{ padding: '16px 20px' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 17 }}>{t('history.title')}</h3>
        {error && <div style={{ color: '#ef4444', marginBottom: 8 }}>{error}</div>}
        {initialLoading && <Skeleton count={5} />}

        {!initialLoading && (
          <>
            {/* Guild score ranking + formula explainer — transparency for all roles */}
            {scoreRanking.length > 0 && (
              <div className="lh-score-section">
                <h4 className="lh-score-title">{t('history.scoreRankingTitle')}</h4>
                <p className="lh-score-desc">{t('history.scoreRankingDesc')}</p>
                <div className="lh-score-grid">
                  {scoreRanking.map(c => {
                    const icon = getClassIconUrl(c.class)
                    return (
                      <div key={c.name} className="lh-score-card">
                        {icon ? <img src={icon} alt="" className="lh-score-icon" draggable={false} /> : <div className="lh-score-icon" />}
                        <span className="lh-score-name" style={{ color: getClassColor(c.class, theme) }}>{c.name}</span>
                        <span className="lh-score-value">{c.score.toFixed(1)}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="lh-formula-box">
                  <div className="lh-formula-toggle" onClick={() => setShowFormula(!showFormula)}>
                    <span>{t('history.formulaTitle')}</span>
                    <span style={{ transform: showFormula ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▶</span>
                  </div>
                  {showFormula && (
                    <div className="lh-formula-content">
                      <div className="lh-formula-item">
                        <strong style={{ color: '#fb923c' }}>{t('admin.formula.alphaTitle')}</strong><br />
                        {t('admin.formula.alphaDesc')} <strong>{t('admin.formula.alphaHighlight')}</strong>
                      </div>
                      <div className="lh-formula-item">
                        <strong style={{ color: 'var(--color-cyan)' }}>{t('admin.formula.betaTitle')}</strong><br />
                        {t('admin.formula.betaDesc')} <strong>{t('admin.formula.betaHighlight')}</strong>{t('admin.formula.betaSuffix')}
                      </div>
                      <div className="lh-formula-item">
                        <strong style={{ color: 'var(--color-transmog)' }}>{t('admin.formula.gammaTitle')}</strong><br />
                        {t('admin.formula.gammaDesc')} <strong>{t('admin.formula.gammaHighlight')}</strong>{t('admin.formula.gammaSuffix')}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Filter bar */}
            <div className="lh-filter-bar">
              {/* Season selector */}
              <select
                value={selectedSeason}
                onChange={e => setSelectedSeason(e.target.value)}
                className="lh-select lh-season-select"
              >
                <option value="current">🏆 {t('history.currentSeason')}</option>
                {seasons.map(s => (
                  <option key={s.id} value={s.id}>📁 {s.name}</option>
                ))}
              </select>
              <input
                type="text"
                value={filterPlayer}
                onChange={e => setFilterPlayer(e.target.value)}
                placeholder={t('history.filterPlayer')}
                className="lh-input"
              />
              <select
                value={filterBoss}
                onChange={e => setFilterBoss(e.target.value)}
                className="lh-select"
              >
                <option value="">{t('history.filterBoss')}</option>
                {bosses.map(b => <option key={b} value={b}>{getBossNameResolved(b)}</option>)}
              </select>
              <select
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="lh-select"
              >
                <option value="">{t('history.filterDate')}</option>
                {dates.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <label className="lh-toggle" htmlFor="lh-show-reverted">
                <input id="lh-show-reverted" className="lh-toggle-input" type="checkbox" checked={showReverted} onChange={e => setShowReverted(e.target.checked)} aria-label={showRevertedLabel} />
                <span className="lh-toggle-switch" aria-hidden="true" />
                <span className="lh-toggle-label">{showRevertedLabel}</span>
              </label>
            </div>

            {filtered.length === 0 && <EmptyState icon="📭" message={t('history.noRecords')} />}

            {/* Grid of cards grouped by date */}
            <div className="lh-groups">
              {(() => {
                const grouped = ((): Array<[string, LootDrop[]]> => {
                  const m = new Map<string, LootDrop[]>()
                  for (const d of paginated) {
                    const key = new Date(d.createdAt).toLocaleDateString()
                    const arr = m.get(key) || []
                    arr.push(d)
                    m.set(key, arr)
                  }
                  return Array.from(m.entries()).sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
                })()

                if (grouped.length === 0) return null

                return grouped.map(([date, items]) => (
                  <div key={date} className="lh-date-group">
                    <div className="lh-date-header">{date}</div>
                    <div className="lh-grid">
                      {(() => {
                        const byBoss = new Map<string, LootDrop[]>()
                        for (const it of items) {
                          const b = it.boss || 'Unknown'
                          const arr = byBoss.get(b) || []
                          arr.push(it)
                          byBoss.set(b, arr)
                        }
                        return Array.from(byBoss.entries()).map(([bossName, bossItems]) => (
                          <div key={bossName} className="lh-boss-group">
                            <div className="lh-boss-header">
                              {getBossImageResolved(bossName) ? (
                                <img src={getBossImageResolved(bossName) as string} alt="" className="lh-boss-icon" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                              ) : null}
                              {getBossNameResolved(bossName)}
                            </div>
                            <div className="lh-boss-items">
                              {bossItems.map(d => {
                        const reverted = !!d.isReverted
                        const isTransmog = !d.assignedTo
                        const icon = getIcon(d)
                        const tooltip = [
                          `${d.itemName}`,
                          `${t('loot.difficulty')}: ${d.difficulty}`,
                          d.assignedTo ? `${t('history.to')} ${d.assignedTo}` : t('history.transmog'),
                          d.isManualAssignment ? t('history.manualAssignment') : (d.awardValue ? `${t('history.value')} +${Number(d.awardValue).toFixed(1)} pts` : null),
                          d.note ? `${t('history.note')} ${d.note}` : null,
                          `${t('history.at')} ${formatDate(d.createdAt)}`,
                          reverted ? `↩ ${t('history.reverted')} ${d.revertedAt ? formatDate(d.revertedAt) : ''}` : null,
                        ].filter(Boolean).join('\n')
                        return (
                                <div
                                  key={d.id}
                                  className={`card lh-card ${reverted ? 'reverted' : ''}`}
                                  title={tooltip}
                                >
                            {/* Item header */}
                            <div className="lh-item-header">
                              {icon
                                ? <img src={icon} alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                                : <div className="lh-icon-placeholder" />
                              }
                              <div className="lh-item-main">
                                <div className={`lh-item-name ${reverted ? 'line-through' : ''}`}>
                                  {d.itemName}
                                </div>
                                <div className="lh-item-meta">{d.boss} · {d.difficulty}</div>
                              </div>
                              {reverted && (
                                <span className="lh-reverted-label">{t('history.reverted')}</span>
                              )}
                              {isAdmin && reverted && (
                                <button
                                  className="lh-delete-btn"
                                  onClick={() => deleteRecord(d.id)}
                                  title={t('history.delete')}
                                >✕</button>
                              )}
                            </div>

                            {/* Assignment info */}
                            {isTransmog ? (
                              <div className="lh-transmog">{t('history.transmog')}</div>
                            ) : (
                              <div className="lh-assigned">
                                <span className="lh-assigned-name">{d.assignedTo}</span>
                                {d.isManualAssignment ? (
                                  <span className="lh-assigned-manual">{t('history.manualAssignment')}</span>
                                ) : (
                                  <span className="lh-assigned-score">+{Number(d.awardValue).toFixed(1)} pts</span>
                                )}
                              </div>
                            )}

                            {/* Reverted info */}
                            {reverted && d.revertedAt && (
                              <div className="lh-reverted-info">
                                <span>↩ {formatDate(d.revertedAt)}</span>
                                {d.awardValue > 0 && (
                                  <span className="lh-score-adjusted">{t('history.scoreAdjusted')}: -{Number(d.awardValue).toFixed(1)}</span>
                                )}
                              </div>
                            )}

                            {/* Note */}
                            {d.note && <div className="lh-note">💬 {d.note}</div>}

                            {/* Footer */}
                            <div className="lh-footer">
                              <div className="lh-created">{formatDate(d.createdAt)}</div>
                              {isAdmin && !reverted && (
                                <button onClick={() => undo(d.id)} className="lh-undo-btn">{t('history.undo')}</button>
                              )}
                            </div>
                          </div>
                        )
                              })}
                            </div>
                          </div>
                        ))
                      })()}
                    </div>
                  </div>
                ))
              })()}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="lh-load-more-row">
                <button className="lh-load-more-btn" onClick={() => setVisibleCount(v => v + PAGE_SIZE)}>
                  {t('history.loadMore')}
                </button>
                <span className="lh-load-more-count">
                  {t('history.showing')} {Math.min(visibleCount, filtered.length)} {t('history.of')} {filtered.length}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Redistribute panel */}
      {redistributeInfo && (
        <div className="lh-redistribute-panel">
          <div className="lh-redistribute-header">
            <div className="lh-redistribute-title">
              {t('history.redistributeTitle')}
            </div>
            <button
              onClick={() => { setRedistributeInfo(null); setRedistCandidates([]); setRedistSelected(''); setRedistManualChar(''); setRedistManualMode('noscore') }}
              className="lh-redistribute-close"
            >✕</button>
          </div>

          <div className="lh-redistribute-item">{redistributeInfo.itemName}</div>
          <div className="lh-redistribute-meta">
            {redistributeInfo.boss} · {redistributeInfo.difficulty}
            {redistributeInfo.assignedTo && ` · ${lang === 'pt' ? 'era de' : 'was'} ${redistributeInfo.assignedTo}`}
            {redistributeInfo.revertedScore > 0 && ` · -${redistributeInfo.revertedScore.toFixed(1)} pts`}
          </div>

          {/* Candidate list */}
          {redistLoading && <div style={{ textAlign: 'center', padding: 8 }}><Spinner size={24} /></div>}
          {!redistLoading && upgradeCandidates.length === 0 && redistCandidates.length > 0 && (
            <div className="lh-redistribute-transmog">TRANSMOG</div>
          )}
          {!redistLoading && upgradeCandidates.length > 0 && (
            <div className="lh-redistribute-candidates">
              {upgradeCandidates.map((c, k) => {
                const isSelected = !redistManualChar && redistSelected === c.characterName
                const classLabel = c.class ? ` (${c.class})` : ''
                return (
                  <button
                    key={k}
                    onClick={() => { setRedistSelected(c.characterName); setRedistManualChar('') }}
                    title={`Upgrade: ${Number(c.itemPercentage).toFixed(1)}% | Score: ${Number(c.overallScore).toFixed(1)} | Priority: ${Number(c.priority).toFixed(3)}`}
                    className={"lh-redistribute-candidate" + (isSelected ? ' lh-redistribute-candidate--selected' : '')}
                  >
                    <span className="lh-redistribute-candidate-name">{c.characterName}{classLabel}</span>
                    <span className="lh-redistribute-candidate-meta">
                      ⬆{Number(c.itemPercentage).toFixed(1)}% · P:{Number(c.priority * 100).toFixed(0)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Manual fallback — for when the intended recipient isn't in the suggestion list above */}
          {!redistLoading && (
            <div className="lh-redistribute-manual">
              <select
                className="candidate-select"
                value={redistManualChar}
                onChange={e => {
                  const v = e.target.value
                  setRedistManualChar(v)
                  if (v) { setRedistSelected(''); setRedistManualMode(prev => prev || 'noscore') }
                }}
                title={t('loot.manualAssign')}
              >
                <option value="">{t('loot.manualAssign')}</option>
                {chars.slice().sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')).map((c: any) => (
                  <option key={c.id ?? c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
              {redistManualChar && (
                <div className="manual-score-toggle" role="group" aria-label={t('loot.manualModeLabel')}>
                  <button
                    type="button"
                    className={"manual-mode-btn" + (redistManualMode === 'score' ? ' active-score' : '')}
                    onClick={() => setRedistManualMode('score')}
                    title={t('loot.manualModeScore')}
                  >{t('loot.manualModeScore')}</button>
                  <button
                    type="button"
                    className={"manual-mode-btn" + (redistManualMode === 'noscore' ? ' active-noscore' : '')}
                    onClick={() => setRedistManualMode('noscore')}
                    title={t('loot.manualModeNoScore')}
                  >{t('loot.manualModeNoScore')}</button>
                  <button
                    type="button"
                    className={"manual-mode-btn" + (redistManualMode === 'transmog' ? ' active-transmog' : '')}
                    onClick={() => setRedistManualMode('transmog')}
                    title={t('loot.manualModeTransmog')}
                  >{t('loot.manualModeTransmog')}</button>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="lh-redistribute-actions">
            <button
              onClick={doRedistribute}
              disabled={(!redistSelected && !redistManualChar) || redistLoading}
              className="lh-redistribute-confirm"
            >{t('loot.distribute')}</button>
            <button
              onClick={() => { setRedistributeInfo(null); setRedistCandidates([]); setRedistSelected(''); setRedistManualChar(''); setRedistManualMode('noscore') }}
              className="lh-redistribute-dismiss"
            >{t('history.dismiss')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
