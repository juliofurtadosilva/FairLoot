import React, { useEffect, useState } from 'react'
import api from '../services/api'
import { useApp } from '../context/AppContext'
import Spinner from '../components/Spinner'
import voidspireImg from '../assets/voidspire.jpg'
import dreamriftImg from '../assets/dreamrift.jpg'
import marchImg from '../assets/marchonqueldanas.jpg'

type Item = { id?: number | null; name: string; icon?: string }
type Candidate = { characterName: string; class?: string; itemPercentage: number; overallScore: number; lootReceivedCount: number; lastLootDate?: string; priority: number }
type SuggestionMeta = { allZeroUpgrade?: boolean; singleUpgradeOnly?: boolean }

export default function Loot() {
  const [step, setStep] = useState(1)
  const [summary, setSummary] = useState<any[]>([])
  const [difficulty, setDifficulty] = useState<'normal' | 'heroic' | 'mythic' | ''>('')
  const [raid, setRaid] = useState<string>('')
  const { t } = useApp()
  const [boss, setBoss] = useState<string>('')
  const [availableItems, setAvailableItems] = useState<Item[]>([])
  const [selectedItems, setSelectedItems] = useState<(Item & { count: number })[]>([])
  const [allocItems, setAllocItems] = useState<{ itemId?: number | null; itemName: string; icon?: string }[]>([])
  const [suggestions, setSuggestions] = useState<Record<number, Candidate[]>>({})
  const [suggestionMeta, setSuggestionMeta] = useState<Record<number, SuggestionMeta>>({})
  const [assignments, setAssignments] = useState<Record<number, string>>({})
  const [chars, setChars] = useState<any[]>([])
  const [raidMapState, setRaidMapState] = useState<Record<string, Record<string, Record<string, Item[]>>>>({})
  const [bossList, setBossList] = useState<string[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)

  const computeBosses = (instName: string, diff: string) => {
    const bosses: string[] = []
    const seen = new Set<string>()
    for (const character of summary) {
      if (!character.instances) continue
      for (const instance of character.instances) {
        const instNameNorm = (instance.name || '').toString().trim().toLowerCase()
        const targetNorm = (instName || '').toString().trim().toLowerCase()
        if (instNameNorm !== targetNorm) continue
        if (!instance.difficulties) continue
        for (const d of instance.difficulties) {
          const dName = (d.difficulty || '').toString().trim().toLowerCase()
          if (diff && dName !== diff) continue
          if (!d.encounters) continue
          for (const e of d.encounters) {
            const bossName = e.name || 'Unknown Boss'
            if (!seen.has(bossName)) { seen.add(bossName); bosses.push(bossName) }
          }
        }
      }
    }
    return bosses
  }

  useEffect(() => {
    const WISHLIST_CACHE_KEY = 'fairloot_wishlist_cache'
    const WISHLIST_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

    const loadCachedWishlist = (): any[] | null => {
      try {
        const raw = sessionStorage.getItem(WISHLIST_CACHE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (parsed.expiry > Date.now() && Array.isArray(parsed.data) && parsed.data.length > 0) return parsed.data
        sessionStorage.removeItem(WISHLIST_CACHE_KEY)
      } catch {}
      return null
    }

    const saveCachedWishlist = (data: any[]) => {
      try {
        sessionStorage.setItem(WISHLIST_CACHE_KEY, JSON.stringify({ data, expiry: Date.now() + WISHLIST_CACHE_TTL }))
      } catch {}
    }

    const buildRaidMapFromSummary = (s: any[]) => {
      const raidMapLocal: Record<string, Record<string, Record<string, Item[]>>> = {}
      for (const ch of s) {
        if (!ch.instances) continue
        for (const inst of ch.instances) {
          const instName = inst.name || 'Unknown Instance'
          if (!raidMapLocal[instName]) raidMapLocal[instName] = {}
          if (!inst.difficulties) continue
          for (const d of inst.difficulties) {
            const diffName = (d.difficulty || '').toLowerCase()
            if (diffName === '') continue
            if (!raidMapLocal[instName][diffName]) raidMapLocal[instName][diffName] = {}
            if (!d.encounters) continue
            for (const e of d.encounters) {
              const bossName = e.name || 'Unknown Boss'
              if (!raidMapLocal[instName][diffName][bossName]) raidMapLocal[instName][diffName][bossName] = []
              const items = (e.items || []).map((it: any) => ({ id: it.id ?? null, name: it.name, icon: it.icon }))
              raidMapLocal[instName][diffName][bossName] = raidMapLocal[instName][diffName][bossName].concat(items)
            }
          }
        }
      }
      return raidMapLocal
    }

    const init = async () => {
      try {
        const me = await api.get('/api/auth/me')
        const isAdminLocal = me.data?.role === 'Admin'
        setIsAdmin(isAdminLocal)

        // try session cache first for instant render
        const cached = loadCachedWishlist()
        if (cached) {
          setSummary(cached)
          setRaidMapState(buildRaidMapFromSummary(cached))
        }

        // fetch wishlists and characters in parallel (always, to get fresh data)
        const [wishlistRes, charsRes] = await Promise.all([
          api.get('/api/guild/wowaudit/wishlists').catch(() => null),
          api.get('/api/guild/characters').catch(() => null),
        ])

        if (wishlistRes) {
          const s = wishlistRes.data?.summary || []
          setSummary(s)
          setRaidMapState(buildRaidMapFromSummary(s))
          if (s.length > 0) saveCachedWishlist(s)
        }

        if (charsRes) {
          setChars(charsRes.data || [])
        }
      } catch (e) {
        console.error(e)
      } finally {
        setInitialLoading(false)
      }
    }
    init()
  }, [])

  const difficulties = ['normal', 'heroic', 'mythic']

  const raidImages: Record<string, string> = {
    'the voidspire': voidspireImg,
    'the dreamrift': dreamriftImg,
    "march on quel'danas": marchImg,
  }

  const getRaidImage = (name: string) => raidImages[name.trim().toLowerCase()] || ''

  const getItemKey = (item: { itemId?: number | null; itemName?: string } | Item) => {
    const anyItem = item as Item & { itemId?: number | null; itemName?: string }
    const id = anyItem.itemId ?? anyItem.id
    const name = anyItem.itemName ?? anyItem.name
    return `${id ?? -1}-${name ?? ''}`
  }

  // Build map of instance -> boss -> items for chosen difficulty
  const buildRaidMap = () => {
    const map: Record<string, Record<string, Item[]>> = {}
    for (const ch of summary) {
      if (!ch.instances) continue
      for (const inst of ch.instances) {
        const instanceName = inst.name || 'Unknown Instance'
        if (!inst.difficulties) continue
        for (const idiff of inst.difficulties) {
          const idiffName = (idiff.difficulty || '').toLowerCase()
          // if a difficulty is selected, only include that one; otherwise include all difficulties
          if (difficulty && idiffName !== difficulty) continue
          if (!idiff.encounters) continue
          for (const e of idiff.encounters) {
            const bossName = e.name || 'Unknown Boss'
            const items: Item[] = (e.items || []).map((it: any) => ({ id: it.id ?? null, name: it.name, icon: it.icon }))
            if (!map[instanceName]) map[instanceName] = {}
            map[instanceName][bossName] = (map[instanceName][bossName] || []).concat(items)
          }
        }
      }
    }
    // deduplicate items per boss
    for (const inst of Object.keys(map)) {
      for (const b of Object.keys(map[inst])) {
        const seen = new Set<string>()
        map[inst][b] = map[inst][b].filter(it => {
          const key = `${it.id ?? -1}-${it.name}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
      }
    }
    return map
  }

  // raidMap may have shape: instance -> difficulty -> boss -> items
  const raidMap = Object.keys(raidMapState).length > 0 ? raidMapState : buildRaidMap()
  const raidList = Object.keys(raidMap)

  useEffect(() => {
    if (raid && boss) {
      const collectItems = (filterDifficulty: string | '') => {
        const items: Item[] = []
        const seen = new Set<string>()
        for (const character of summary) {
          if (!character.instances) continue
          for (const instance of character.instances) {
            const instNameNorm = (instance.name || '').toString().trim().toLowerCase()
            const raidNorm = (raid || '').toString().trim().toLowerCase()
            if (instNameNorm !== raidNorm) continue
            if (!instance.difficulties) continue
            for (const diff of instance.difficulties) {
              const diffName = (diff.difficulty || '').toString().trim().toLowerCase()
              if (filterDifficulty && diffName !== filterDifficulty) continue
              if (!diff.encounters) continue
              for (const encounter of diff.encounters) {
                const bossName = (encounter.name || '').toString().trim().toLowerCase()
                const bossNorm = (boss || '').toString().trim().toLowerCase()
                if (bossName !== bossNorm) continue
                for (const it of (encounter.items || [])) {
                  const item: Item = { id: it.id ?? null, name: it.name, icon: it.icon }
                  const key = `${item.id ?? -1}-${item.name}`
                  if (!seen.has(key)) {
                    seen.add(key)
                    items.push(item)
                  }
                }
              }
            }
          }
        }
        return items
      }

      const itemsFromSummary = collectItems('')
      if (itemsFromSummary.length > 0) {
        setAvailableItems(itemsFromSummary)
        return
      }
      // fallback: if selected difficulty has no items, try all difficulties

      // fallback: raidMapState
      if (raidMap[raid]) {
        const instVal: any = raidMap[raid]
        if (difficulty && instVal && instVal[difficulty] && instVal[difficulty][boss]) {
          setAvailableItems(instVal[difficulty][boss])
          return
        }
        if (instVal && instVal[boss]) {
          setAvailableItems(instVal[boss])
          return
        }
      }
      setAvailableItems([])
    } else setAvailableItems([])
  }, [raid, boss, difficulty, summary])

  const onItemClick = (it: Item) => {
    // clicking an item increments its count; if count becomes 2 or more, auto-run suggestions
    const exists = selectedItems.find(si => si.id === it.id && si.name === it.name)
    let newSelected: (Item & { count: number })[] = []
    if (!exists) {
      newSelected = [...selectedItems, { ...it, count: 1 }]
    } else {
      newSelected = selectedItems.map(si => si.id === it.id && si.name === it.name ? { ...si, count: (si.count || 0) + 1 } : si)
    }
    setSelectedItems(newSelected)
  }

  const setItemCount = (it: Item & { count?: number }, count: number) => {
    setSelectedItems(selectedItems.map(si => si.id === it.id && si.name === it.name ? { ...si, count } : si))
  }

  const onItemRightClick = (e: React.MouseEvent, it: Item) => {
    e.preventDefault()
    // decrement or remove
    const exists = selectedItems.find(si => si.id === it.id && si.name === it.name)
    if (!exists) return
    if ((exists.count || 0) > 1) {
      setSelectedItems(selectedItems.map(si => si.id === it.id && si.name === it.name ? { ...si, count: (si.count || 0) - 1 } : si))
    } else {
      setSelectedItems(selectedItems.filter(si => !(si.id === it.id && si.name === it.name)))
    }
  }

  const goSuggest = async (itemsParam?: (Item & { count: number })[]) => {
    const itemsToUse = itemsParam ?? selectedItems
    if (!itemsToUse || itemsToUse.length === 0) return
    // ensure selectedItems state matches items used for suggestion so step2 renders correctly
    setSelectedItems(itemsToUse)
    // expand into unit-level entries so backend returns a suggestion per unit
    const payloadUnits: { itemId?: number | null; itemName: string; icon?: string }[] = []
    itemsToUse.forEach(i => {
      const cnt = Math.max(1, i.count || 1)
      for (let k = 0; k < cnt; k++) payloadUnits.push({ itemId: i.id, itemName: i.name, icon: i.icon })
    })
    setAllocItems(payloadUnits)
    setLoading(true)
    setStep(2)
    try {
      const payload = { items: payloadUnits.map(u => ({ itemId: u.itemId, itemName: u.itemName, count: 1 })) }
      const r = await api.post('/api/loot/suggest', payload)
      const data = r.data as any[]
      const map: Record<number, Candidate[]> = {}
      const meta: Record<number, SuggestionMeta> = {}
      data.forEach((entry: any, idx: number) => {
        map[idx] = (entry.candidates || []).map((c: any) => ({ characterName: c.characterName, class: c.class, itemPercentage: c.itemPercentage, overallScore: c.overallScore, lootReceivedCount: c.lootReceivedCount ?? 0, lastLootDate: c.lastLootDate, priority: c.priority ?? 0 }))
        meta[idx] = { allZeroUpgrade: entry.allZeroUpgrade, singleUpgradeOnly: entry.singleUpgradeOnly }
      })
      setSuggestions(map)
      setSuggestionMeta(meta)
      // prefill assignments with top candidate if present
      const assignMap: Record<number, string> = {}
      const grouped = new Map<string, number[]>()
      payloadUnits.forEach((it, idx) => {
        const key = getItemKey(it)
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key)!.push(idx)
      })
      grouped.forEach(indices => {
        const candidates = map[indices[0]] || []
        // candidates arrive sorted by priority (upgrade + fairness) from backend
        const upgradeCandidates = candidates.filter(c => c.itemPercentage > 0)
        if (upgradeCandidates.length === 0) return
        indices.forEach((itemIdx, pos) => {
          if (pos < upgradeCandidates.length) {
            assignMap[itemIdx] = upgradeCandidates[pos].characterName
          }
        })
      })
      setAssignments(assignMap)
    } catch (e) {
      console.error(e)
    } finally { setLoading(false) }
  }

  const getTransmogStatus = (idx: number) => {
    const meta = suggestionMeta[idx]
    const candidates = suggestions[idx] || []
    const upgradeCandidates = candidates.filter(c => c.itemPercentage > 0)
    const itemKey = getItemKey(allocItems[idx])
    const groupIndices = allocItems.reduce<number[]>((acc, item, i) => {
      if (getItemKey(item) === itemKey) acc.push(i)
      return acc
    }, [])
    const groupPosition = groupIndices.indexOf(idx)
    const isTransmog = !!meta?.allZeroUpgrade || groupPosition >= upgradeCandidates.length
    return { isTransmog, upgradeCandidates }
  }

  useEffect(() => {
    if (allocItems.length === 0) return
    let changed = false
    const updated = { ...assignments }
    allocItems.forEach((_, idx) => {
      if (getTransmogStatus(idx).isTransmog && updated[idx]) {
        updated[idx] = ''
        changed = true
      }
    })
    if (changed) setAssignments(updated)
  }, [allocItems, suggestionMeta, suggestions, assignments])

  const doDistribute = async () => {
    // use allocItems which represents each unit separately
    const allocations = allocItems.map((it, idx) => ({
      itemId: it.itemId,
      itemName: it.itemName,
      assignedTo: getTransmogStatus(idx).isTransmog ? '' : (assignments[idx] || ''),
      boss,
      difficulty
    }))
    try {
      const r = await api.post('/api/loot/distribute', { allocations })
      alert(`${r.data.distributed} ${t('loot.distributed')}`)
      // reset
      setSelectedItems([])
      setSuggestions({})
      setSuggestionMeta({})
      setAssignments({})
      setStep(1)
    } catch (e) {
      console.error(e)
      alert(t('loot.distributeError'))
    }
  }

  return (
    <div className="tab-content">
      <div className="card tab-card">
        {initialLoading && <Spinner size={40} />}
        {!initialLoading && step === 1 && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
              {/* Difficulty buttons — vertical */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{t('loot.difficulty')}</label>
                {['normal', 'heroic', 'mythic'].map(d => (
                  <button
                    key={d}
                    onClick={() => {
                      setDifficulty(d as any)
                      setBoss('')
                      setBossList(raid ? computeBosses(raid, d) : [])
                      setSelectedItems([])
                      setAllocItems([])
                      setSuggestions({})
                      setSuggestionMeta({})
                      setAssignments({})
                      setStep(1)
                    }}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: difficulty === d ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: difficulty === d ? 'rgba(var(--accent-rgb),0.08)' : 'transparent',
                      cursor: 'pointer',
                      width: 42,
                      textAlign: 'center',
                      fontWeight: 600,
                    }}>{d === 'normal' ? 'N' : d === 'heroic' ? 'H' : 'M'}</button>
                ))}
              </div>

              {/* Raid images */}
              {raidList.length === 0 && <div style={{ color: 'var(--muted)' }}>{t('loot.selectDiffToLoad')}</div>}
              {raidList.map(instName => {
                const img = getRaidImage(instName)
                const disabled = !difficulty
                return (
                  <div
                    key={instName}
                    onClick={() => {
                      if (disabled) return
                      setRaid(instName)
                      setBoss('')
                      const bosses = computeBosses(instName, difficulty)
                      setBossList(bosses)
                      setSelectedItems([])
                      setAllocItems([])
                      setSuggestions({})
                      setSuggestionMeta({})
                      setAssignments({})
                      setStep(1)
                    }}
                    style={{
                      width: 160, height: 160,
                      borderRadius: 12,
                      border: raid === instName ? '2px solid var(--accent)' : '2px solid var(--muted)',
                      boxShadow: raid === instName ? '0 0 12px rgba(var(--accent-rgb),0.45)' : 'none',
                      background: img ? `url(${img}) center/cover no-repeat` : 'rgba(var(--accent-rgb),0.06)',
                      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                      cursor: disabled ? 'default' : 'pointer',
                      overflow: 'hidden', position: 'relative',
                      filter: disabled ? 'grayscale(100%) brightness(0.5)' : 'none',
                      opacity: disabled ? 0.6 : 1,
                      transition: 'filter 0.3s, opacity 0.3s, box-shadow 0.3s',
                      userSelect: 'none', WebkitUserSelect: 'none',
                    }}
                  >
                    <div style={{
                      textAlign: 'center',
                      padding: '6px 4px', fontSize: 13, fontWeight: 600,
                      lineHeight: '1.3', color: '#fff',
                      minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                      borderRadius: '0 0 10px 10px',
                      userSelect: 'none', WebkitUserSelect: 'none',
                    }}>{instName}</div>
                  </div>
                )
              })}
            </div>

            {raid && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ marginBottom: 8, fontSize: 15 }}><strong>{t('loot.raid')}:</strong> {raid}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {bossList.length > 0 ? (
                    bossList.map(b => (
                      <button
                        key={b}
                        onClick={() => {
                          setBoss(b)
                          setSelectedItems([])
                          setAllocItems([])
                          setSuggestions({})
                          setSuggestionMeta({})
                          setAssignments({})
                          setStep(1)
                        }}
                        style={{ padding: '6px 8px', borderRadius: 6, border: boss === b ? '2px solid #10b981' : '1px solid var(--border)', background: boss === b ? 'rgba(16,185,129,0.06)' : 'transparent' }}
                      >{b}</button>
                    ))
                  ) : (
                    <div>{t('loot.noBoss')}</div>
                  )}
                </div>
              </div>
            )}

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <strong style={{ fontSize: 15 }}>{t('loot.available')}</strong>
              <div>
                {availableItems.length === 0 && <div style={{ color: 'var(--muted)' }}>{!raid || !boss ? t('loot.selectRaidBoss') : t('loot.noItems')}</div>}
                {/* raw wishlist debug removed */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {availableItems.map((it, i) => {
                    const sel = selectedItems.find(si => si.name === it.name && si.id === it.id)
                      return (
                      <div
                        key={i}
                        onClick={() => onItemClick(it)}
                        onContextMenu={(e) => onItemRightClick(e, it)}
                        onMouseDown={e => e.preventDefault()}
                        style={{
                          userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none',
                          cursor: 'pointer', padding: 8, borderRadius: 6,
                          border: sel ? '2px solid var(--accent)' : '1px solid var(--border)',
                          display: 'flex', alignItems: 'center', gap: 8,
                          flex: '1 1 200px',
                          maxWidth: 260,
                          minHeight: 56,
                          boxSizing: 'border-box'
                        }}
                      >
                        {it.icon ? <img src={it.icon} alt="" style={{ width: 36, height: 36 }} draggable={false} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} /> : <div style={{ width: 36, height: 36, background: 'var(--panel-bg)', borderRadius: 4 }} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
                        </div>
                        {sel && <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0, background: 'var(--accent)', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{sel.count}</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
              <button
                onClick={() => goSuggest()}
                disabled={selectedItems.length === 0 || !boss || !difficulty || loading}
                style={{ padding: '10px 32px', fontSize: 15, borderRadius: 8, border: '1px solid rgba(var(--accent-rgb),0.4)', background: 'rgba(var(--accent-rgb),0.12)' }}
              >{t('loot.next')}</button>
            </div>
          </div>
        )}

        {!initialLoading && step === 2 && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loading && suggestions && Object.keys(suggestions).length === 0 && (
              <div style={{ marginBottom: 8 }}>{t('loot.loading')}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
              {allocItems.map((it, idx) => {
                const allCandidates = suggestions[idx] || []
                const topCandidates = allCandidates.slice(0, 3)
                const upgradeCandidates = allCandidates.filter(c => c.itemPercentage > 0)
                const { isTransmog } = getTransmogStatus(idx)
                return (
                  <div key={idx} className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '6px 0 4px', borderBottom: '1px solid rgba(var(--accent-rgb),0.12)' }}>
                      {it.icon ? <img src={it.icon} alt="" style={{ width: 32, height: 32, borderRadius: 4, flexShrink: 0 }} draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} /> : <div style={{ width: 32, height: 32, background: 'var(--panel-bg)', borderRadius: 4, flexShrink: 0 }} />}
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.itemName}</div>
                    </div>
                    {isTransmog && (
                      <div style={{ color: 'var(--color-transmog)', fontWeight: 700, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center', padding: '4px 0' }}>TRANSMOG</div>
                    )}
                    {!isTransmog && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 6 }}>
                          {topCandidates.map((c: any, k: number) => {
                            const isSelected = assignments[idx] === c.characterName
                            const classLabel = c.class ? ` (${c.class})` : ''
                            return (
                              <button
                                key={k}
                                onClick={() => setAssignments({ ...assignments, [idx]: c.characterName })}
                                title={`Upgrade: ${Number(c.itemPercentage).toFixed(1)}% | Score: ${Number(c.overallScore).toFixed(1)} | Itens recebidos (30d): ${c.lootReceivedCount} | Priority: ${Number(c.priority).toFixed(3)}`}
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  border: isSelected ? '2px solid var(--color-yellow)' : '1px solid var(--border)',
                                  background: isSelected ? 'rgba(var(--accent-rgb),0.10)' : 'transparent',
                                  textAlign: 'center',
                                  transition: 'border-color 0.2s, background 0.2s',
                                }}
                              >
                                <div style={{ fontWeight: 600 }}>{c.characterName}{classLabel}</div>
                                <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>
                                  ⬆{Number(c.itemPercentage).toFixed(1)}% · P:{Number(c.priority * 100).toFixed(0)}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                        {upgradeCandidates.length > 3 && (
                          <select
                            value={assignments[idx] || ''}
                            onChange={e => setAssignments({ ...assignments, [idx]: e.target.value })}
                            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--select-bg)', color: 'var(--text)', fontSize: 11, width: '100%', marginTop: 2 }}
                          >
                            <option value="">{t('loot.choose')}</option>
                            {upgradeCandidates.map((c, k) => {
                              const classLabel = c.class ? ` (${c.class})` : ''
                              return (
                                <option key={k} value={c.characterName}>{c.characterName}{classLabel} — ⬆{Number(c.itemPercentage).toFixed(1)}% · P:{Number(c.priority * 100).toFixed(0)}</option>
                              )
                            })}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button onClick={() => setStep(1)}>{t('loot.back')}</button>
              <button onClick={doDistribute} style={{ padding: '10px 32px', fontSize: 15, borderRadius: 8, border: '1px solid rgba(var(--accent-rgb),0.4)', background: 'rgba(var(--accent-rgb),0.12)' }}>{t('loot.distribute')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
