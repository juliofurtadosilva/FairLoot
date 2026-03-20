import React, { useEffect, useState, useMemo } from 'react'
import api from '../services/api'
import { useApp } from '../context/AppContext'
import Spinner from '../components/Spinner'
import './LootHistory.scss'
import { isDemoMode, getDemoLootHistory, removeDemoLootHistory, getDemoWishlistSummary, getDemoCharacters, getDemoGuild, addDemoLootHistory } from '../services/demoData'
import { getBossImageUrl } from '../services/bossMap'

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
  const { t, lang } = useApp()

  // filters
  const [filterPlayer, setFilterPlayer] = useState('')
  const [filterBoss, setFilterBoss] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [showReverted, setShowReverted] = useState(true)

  // redistribute panel
  const [redistributeInfo, setRedistributeInfo] = useState<RedistributeInfo | null>(null)
  const [redistCandidates, setRedistCandidates] = useState<Candidate[]>([])
  const [redistSelected, setRedistSelected] = useState('')
  const [redistLoading, setRedistLoading] = useState(false)
  const [redistSingleUpgrade, setRedistSingleUpgrade] = useState(false)

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

  const fetchHistory = async () => {
    try {
      if (isDemoMode()) {
        const h = getDemoLootHistory()
        setDrops(h)
        setIsAdmin(true)
        // resolve icons for demo history
        const ids = h.map((d: any) => d.itemId).filter((id: any) => id != null) as number[]
        if (ids.length > 0) resolveIcons(ids)
      } else {
        const [r, me] = await Promise.all([
          api.get('/api/loot/history'),
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

  useEffect(() => { fetchHistory() }, [])

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
    if (!confirm(t('history.undoConfirm'))) return
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
      alert(err?.response?.data || t('history.errorUndo'))
    }
  }

  const doRedistribute = async () => {
    if (!redistributeInfo || !redistSelected) return
    const alloc = {
      itemId: redistributeInfo.itemId,
      itemName: redistributeInfo.itemName,
      assignedTo: redistSelected,
      boss: redistributeInfo.boss,
      difficulty: redistributeInfo.difficulty,
      isSingleUpgrade: redistSingleUpgrade,
    }
    try {
      if (isDemoMode()) {
        const drop = {
          id: `demo-${Date.now()}-0`,
          itemName: alloc.itemName,
          assignedTo: alloc.assignedTo,
          boss: alloc.boss,
          difficulty: alloc.difficulty,
          awardValue: alloc.isSingleUpgrade ? 0 : 1,
          note: '',
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
    } catch (e) {
      console.error(e)
      alert(t('loot.distributeError'))
    }
  }

  // unique values for filter dropdowns
  const bosses = useMemo(() => [...new Set(drops.map(d => d.boss).filter(Boolean))].sort(), [drops])
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

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
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
      <div className="card tab-card" style={{ padding: '16px 20px' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 17 }}>{t('history.title')}</h3>
        {error && <div style={{ color: '#ef4444', marginBottom: 8 }}>{error}</div>}
        {initialLoading && <Spinner size={40} />}

        {!initialLoading && (
          <>
            {/* Filter bar */}
            <div className="lh-filter-bar">
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
                {bosses.map(b => <option key={b} value={b}>{b}</option>)}
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

            {filtered.length === 0 && <div className="lh-no-records">{t('history.noRecords')}</div>}

            {/* Grid of cards grouped by date */}
            <div className="lh-groups">
              {(() => {
                const grouped = ((): Array<[string, LootDrop[]]> => {
                  const m = new Map<string, LootDrop[]>()
                  for (const d of filtered) {
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
                              {getBossImageUrl(bossName) ? (
                                <img src={getBossImageUrl(bossName) as string} alt="" className="lh-boss-icon" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                              ) : null}
                              {bossName}
                            </div>
                            <div className="lh-boss-items">
                              {bossItems.map(d => {
                        const reverted = !!d.isReverted
                        const isTransmog = !d.assignedTo
                        const icon = getIcon(d)
                        return (
                                <div
                                  key={d.id}
                                  className={`card lh-card ${reverted ? 'reverted' : ''}`}
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
                            </div>

                            {/* Assignment info */}
                            {isTransmog ? (
                              <div className="lh-transmog">{t('history.transmog')}</div>
                            ) : (
                              <div className="lh-assigned">
                                <span className="lh-assigned-name">{d.assignedTo}</span>
                                <span className="lh-assigned-score">+{Number(d.awardValue).toFixed(1)} pts</span>
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
          </>
        )}
      </div>

      {/* Redistribute panel */}
      {redistributeInfo && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
          background: 'var(--card)', border: '1.5px solid var(--accent)',
          borderRadius: 12, padding: '16px 20px', width: 320, maxWidth: 'calc(100vw - 48px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          animation: 'slideInRight 0.3s ease-out',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {t('history.redistributeTitle')}
            </div>
            <button
              onClick={() => { setRedistributeInfo(null); setRedistCandidates([]); setRedistSelected('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
            >✕</button>
          </div>

          <div style={{ fontSize: 12, fontWeight: 600 }}>{redistributeInfo.itemName}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>
            {redistributeInfo.boss} · {redistributeInfo.difficulty}
            {redistributeInfo.assignedTo && ` · ${lang === 'pt' ? 'era de' : 'was'} ${redistributeInfo.assignedTo}`}
            {redistributeInfo.revertedScore > 0 && ` · -${redistributeInfo.revertedScore.toFixed(1)} pts`}
          </div>

          {/* Candidate list */}
          {redistLoading && <div style={{ textAlign: 'center', padding: 8 }}><Spinner size={24} /></div>}
          {!redistLoading && upgradeCandidates.length === 0 && redistCandidates.length > 0 && (
            <div style={{ color: 'var(--color-transmog)', fontWeight: 700, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center', padding: '4px 0' }}>TRANSMOG</div>
          )}
          {!redistLoading && upgradeCandidates.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
              {upgradeCandidates.map((c, k) => {
                const isSelected = redistSelected === c.characterName
                const classLabel = c.class ? ` (${c.class})` : ''
                return (
                  <button
                    key={k}
                    onClick={() => setRedistSelected(c.characterName)}
                    title={`Upgrade: ${Number(c.itemPercentage).toFixed(1)}% | Score: ${Number(c.overallScore).toFixed(1)} | Priority: ${Number(c.priority).toFixed(3)}`}
                    style={{
                      padding: '6px 10px', borderRadius: 6, fontSize: 11,
                      border: isSelected ? '2px solid var(--color-yellow)' : '1px solid var(--border)',
                      background: isSelected ? 'rgba(var(--accent-rgb),0.10)' : 'transparent',
                      textAlign: 'left', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      color: 'var(--text)',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{c.characterName}{classLabel}</span>
                    <span style={{ fontSize: 9, color: 'var(--muted)', marginLeft: 6, flexShrink: 0 }}>
                      ⬆{Number(c.itemPercentage).toFixed(1)}% · P:{Number(c.priority * 100).toFixed(0)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              onClick={doRedistribute}
              disabled={!redistSelected || redistLoading}
              style={{
                flex: 1, padding: '7px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                border: '1px solid rgba(var(--accent-rgb),0.4)', background: 'rgba(var(--accent-rgb),0.12)',
                cursor: redistSelected ? 'pointer' : 'default', color: 'var(--text)',
                opacity: redistSelected ? 1 : 0.5,
              }}
            >{t('loot.distribute')}</button>
            <button
              onClick={() => { setRedistributeInfo(null); setRedistCandidates([]); setRedistSelected('') }}
              style={{
                padding: '7px 12px', borderRadius: 6, fontSize: 12,
                border: '1px solid var(--border)', background: 'transparent',
                cursor: 'pointer', color: 'var(--muted)',
              }}
            >{t('history.dismiss')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
