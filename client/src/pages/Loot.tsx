import React, { useEffect, useState } from 'react'
import api from '../services/api'
import { useApp } from '../context/AppContext'
import Spinner from '../components/Spinner'
import Skeleton from '../components/Skeleton'
import { isDemoMode, getDemoWishlistSummary, getDemoGuild, getDemoCharacters, getDemoLootHistory, addDemoLootHistory } from '../services/demoData'
import { getBossImageUrl } from '../services/bossMap'
import { getCachedWishlist, setCachedWishlist, WISHLIST_REFRESH_INTERVAL } from '../services/wishlistCache'
import { getClassNameLocalized, getClassIconUrl, getClassColor } from '../services/classIcons'
import voidspireImg from '../assets/voidspire.jpg'
import dreamriftImg from '../assets/dreamrift.jpg'
import marchImg from '../assets/marchonqueldanas.jpg'
import './Loot.scss'

type Item = { id?: number | null; name: string; icon?: string }
type Candidate = { characterName: string; class?: string; itemPercentage: number; overallScore: number; lootReceivedCount: number; lastLootDate?: string; priority: number }
type SuggestionMeta = { allZeroUpgrade?: boolean; singleUpgradeOnly?: boolean }

function buildRaidMapFromSummary(s: any[]): Record<string, Record<string, Record<string, Item[]>>> {
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

export default function Loot() {
  const [step, setStep] = useState(1)
  const [summary, setSummary] = useState<any[]>([])
  const [difficulty, setDifficulty] = useState<'normal' | 'heroic' | 'mythic' | ''>('')
  const [raid, setRaid] = useState<string>('')
  const { t, lang, theme, showAlert, showToast } = useApp()
  const [boss, setBoss] = useState<string>('')
  const [availableItems, setAvailableItems] = useState<Item[]>([])
  const [selectedItems, setSelectedItems] = useState<(Item & { count: number })[]>([])
  const [allocItems, setAllocItems] = useState<{ itemId?: number | null; itemName: string; icon?: string }[]>([])
  const [suggestions, setSuggestions] = useState<Record<number, Candidate[]>>({})
  const [suggestionMeta, setSuggestionMeta] = useState<Record<number, SuggestionMeta>>({})
  const [assignments, setAssignments] = useState<Record<number, string>>({})
  const [reservedMap, setReservedMap] = useState<Record<string, boolean>>({})

  const normalizeName = (n?: string) => {
    if (!n) return ''
    try {
      return n.toString().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()
    } catch {
      return n.toString().trim().toLowerCase()
    }
  }

  const assignToIndex = (index: number, charName: string) => {
    console.log('[assignToIndex] before', { index, charName, assignments, reservedMap })
    const updated = { ...assignments }
    const clearedIndices: number[] = []
    // clear this person from other indices unless that index is single-upgrade-only or allowDuplicate is active
    if (!allowDuplicateItems.has(index)) {
      Object.keys(updated).forEach(kidx => {
        const i = Number(kidx)
        if (i !== index && normalizeName(updated[i]) === normalizeName(charName) && !suggestionMeta[i]?.singleUpgradeOnly && !allowDuplicateItems.has(i)) {
          updated[i] = ''
          clearedIndices.push(i)
        }
      })
    }
    updated[index] = charName || ''
    // auto-reassign cleared indices to next best available candidate
    for (const ci of clearedIndices) {
      const cands = suggestions[ci] || []
      const upgradeCands = [...cands].filter(c => c.itemPercentage > 0).sort((a, b) => (b.priority - a.priority) || (b.itemPercentage - a.itemPercentage))
      // collect all currently assigned names (excluding this cleared index)
      const usedNames = new Set<string>()
      Object.entries(updated).forEach(([k, v]) => {
        if (!v || Number(k) === ci) return
        if (suggestionMeta[Number(k)]?.singleUpgradeOnly) return
        usedNames.add(normalizeName(v))
      })
      const nextBest = upgradeCands.find(c => !usedNames.has(normalizeName(c.characterName)))
      if (nextBest) updated[ci] = nextBest.characterName
    }
    setAssignments(updated)
    // update reserved state
    const newReserved: Record<string, boolean> = {}
    Object.entries(updated).forEach(([k, v]) => {
      const ki = Number(k)
      if (!v) return
      if (suggestionMeta[ki]?.singleUpgradeOnly) return
      newReserved[normalizeName(v)] = true
    })
    setReservedMap(newReserved)
    console.log('[assignToIndex] after', { updated, newReserved })
  }
  // characters/iLevel removed per request
  const [chars, setChars] = useState<any[]>([])
  const [raidMapState, setRaidMapState] = useState<Record<string, Record<string, Record<string, Item[]>>>>({})
  const [bossList, setBossList] = useState<string[]>([])
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1200)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [guild, setGuild] = useState<any>(null)
  const [itemNotes, setItemNotes] = useState<Record<number, string>>({})
  const [noteOpenIdx, setNoteOpenIdx] = useState<number | null>(null)
  const [itemNameMap, setItemNameMap] = useState<Record<number, string>>({})
  const [allowDuplicateItems, setAllowDuplicateItems] = useState<Set<number>>(new Set())

  // Priority color — interpolates from gold (top) to gray (bottom) based on position
  const getPriorityColor = (position: number, total: number) => {
    if (theme === 'light') {
      // dark gold (#8B6914) → dark gray (#555555) for light backgrounds
      if (total <= 1) return '#8B6914'
      const t = position / (total - 1)
      const r = Math.round(139 - t * (139 - 85))
      const g = Math.round(105 - t * (105 - 85))
      const b = Math.round(20 + t * (85 - 20))
      return `rgb(${r},${g},${b})`
    }
    if (total <= 1) return '#FFD700'
    const t = position / (total - 1)
    // gold (#FFD700) → gray (#666666)
    const r = Math.round(255 - t * (255 - 102))
    const g = Math.round(215 - t * (215 - 102))
    const b = Math.round(0 + t * (102 - 0))
    return `rgb(${r},${g},${b})`
  }

  // Upgrade color — value-based: lower % → gray (#666), higher % → red (#ef4444)
  const getUpgradeColor = (pct: number, allPcts: number[]) => {
    const min = Math.min(...allPcts)
    const max = Math.max(...allPcts)
    const t = max > min ? (pct - min) / (max - min) : 1
    if (theme === 'light') {
      // dark gray (#777) → dark red (#b91c1c) for light backgrounds
      const r = Math.round(119 + t * (185 - 119))
      const g = Math.round(119 - t * (119 - 28))
      const b = Math.round(119 - t * (119 - 28))
      return `rgb(${r},${g},${b})`
    }
    // gray (#666666) → red (#ef4444)
    const r = Math.round(102 + t * (239 - 102))
    const g = Math.round(102 - t * (102 - 68))
    const b = Math.round(102 - t * (102 - 68))
    return `rgb(${r},${g},${b})`
  }

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
    const resolveIconsForSummary = async (data: any[]) => {
      const ids = new Set<number>()
      for (const ch of data) {
        if (!ch.instances) continue
        for (const inst of ch.instances) {
          if (!inst.difficulties) continue
          for (const d of inst.difficulties) {
            if (!d.encounters) continue
            for (const enc of d.encounters) {
              if (!enc.items) continue
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
        return data.map((ch: any) => ({
          ...ch,
          instances: (ch.instances || []).map((inst: any) => ({
            ...inst,
            difficulties: (inst.difficulties || []).map((d: any) => ({
              ...d,
              encounters: (d.encounters || []).map((enc: any) => ({
                ...enc,
                items: (enc.items || []).map((it: any) => ({
                  ...it,
                  icon: it.icon || (it.id ? iconMap[it.id] ?? null : null),
                })),
              })),
            })),
          })),
        }))
      } catch { return data }
    }

    const init = async () => {
      try {
        if (isDemoMode()) {
          setIsAdmin(true)
          const s = getDemoWishlistSummary()
          setSummary(s)
          setRaidMapState(buildRaidMapFromSummary(s))
          // demo characters still used for other demo features but iLevel-specific data removed
          setGuild(getDemoGuild())
          setInitialLoading(false)
          // resolve icons asynchronously
          resolveIconsForSummary(s).then(updated => {
            setSummary(updated)
            setRaidMapState(buildRaidMapFromSummary(updated))
          }).catch(() => {})
          return
        }

        const me = await api.get('/api/auth/me')
        const isAdminLocal = me.data?.role === 'Admin'
        setIsAdmin(isAdminLocal)

        // show cached data instantly (stale-while-revalidate)
        const cached = getCachedWishlist()
        if (cached) {
          setSummary(cached)
          setRaidMapState(buildRaidMapFromSummary(cached))
          setInitialLoading(false)
        }

        // fetch wishlists and characters in parallel (always, to get fresh data)
        const [wishlistRes, charsRes, guildRes] = await Promise.all([
          api.get('/api/guild/wowaudit/wishlists').catch(() => null),
          api.get('/api/guild/characters').catch(() => null),
          api.get('/api/guild').catch(() => null),
        ])

        if (wishlistRes) {
          const s = wishlistRes.data?.summary || []
          setSummary(s)
          setRaidMapState(buildRaidMapFromSummary(s))
          if (s.length > 0) setCachedWishlist(s)
        }

        // character list fetch omitted — iLevel logic removed

        if (guildRes) {
          setGuild(guildRes.data)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setInitialLoading(false)
      }
    }
    init()
  }, [])

  // Background refresh — revalidate wishlist data periodically
  useEffect(() => {
    if (isDemoMode()) return
    const refresh = async () => {
      try {
        const res = await api.get('/api/guild/wowaudit/wishlists')
        const s = res.data?.summary || []
        if (s.length > 0) {
          setSummary(s)
          setRaidMapState(buildRaidMapFromSummary(s))
          setCachedWishlist(s)
        }
      } catch {}
    }
    const id = setInterval(refresh, WISHLIST_REFRESH_INTERVAL)
    return () => clearInterval(id)
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

  // resolve localized item names when available items change
  useEffect(() => {
    if (lang === 'en' || availableItems.length === 0) return
    const ids = availableItems.map(it => it.id).filter((id): id is number => id != null && !itemNameMap[id])
    const unique = [...new Set(ids)]
    if (unique.length === 0) return
    api.post('/api/loot/item-names', { ids: unique, locale: lang === 'pt' ? 'pt_BR' : 'en_US' })
      .then(res => {
        const names = res.data as Record<number, string | null>
        setItemNameMap(prev => {
          const next = { ...prev }
          for (const [k, v] of Object.entries(names)) { if (v) next[Number(k)] = v }
          return next
        })
      }).catch(() => {})
  }, [availableItems, lang])

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

  const demoSuggest = (payloadUnits: { itemId?: number | null; itemName: string; icon?: string }[], difficulty?: string) => {
    const guild = getDemoGuild()
    const alpha = guild.priorityAlpha ?? 0.4
    const beta = guild.priorityBeta ?? 0.3
    const gamma = guild.priorityGamma ?? 0.3
    const demoHistory = getDemoLootHistory()
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    const recentDrops = demoHistory.filter((d: any) => d.assignedTo && new Date(d.createdAt).getTime() >= cutoff)
    const lootCountByChar: Record<string, number> = {}
    const lastLootByChar: Record<string, number> = {}
    for (const d of recentDrops) {
      lootCountByChar[d.assignedTo] = (lootCountByChar[d.assignedTo] || 0) + 1
      const ts = new Date(d.createdAt).getTime()
      if (!lastLootByChar[d.assignedTo] || ts > lastLootByChar[d.assignedTo]) lastLootByChar[d.assignedTo] = ts
    }

    const data = payloadUnits.map(unit => {
      const candidates: Candidate[] = []
      for (const ch of summary) {
        let bestPerc = 0
        if (ch.instances) {
          for (const inst of ch.instances) {
            if (!inst.difficulties) continue
            for (const d of inst.difficulties) {
              const dName = (d.difficulty || '').toString().trim().toLowerCase()
              if (difficulty && dName !== (difficulty || '').toLowerCase()) continue
              if (!d.encounters) continue
              for (const e of d.encounters) {
                if (!e.items) continue
                for (const it of e.items) {
                  const match = (unit.itemId != null && it.id != null && unit.itemId === it.id) ||
                    (unit.itemName && it.name && unit.itemName.toLowerCase() === it.name.toLowerCase())
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
      }

      const sorted = candidates
        .sort((a, b) => b.priority - a.priority || b.itemPercentage - a.itemPercentage || a.overallScore - b.overallScore || (new Date(a.lastLootDate || 0).getTime()) - (new Date(b.lastLootDate || 0).getTime()))

      const positiveCount = sorted.filter(c => c.itemPercentage > 0).length
      return { candidates: sorted, allZeroUpgrade: positiveCount === 0, singleUpgradeOnly: positiveCount === 1 }
    })
    return data
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
      let data: any[]
      if (isDemoMode()) {
        data = demoSuggest(payloadUnits, difficulty)
      } else {
        const payload = { items: payloadUnits.map(u => ({ itemId: u.itemId, itemName: u.itemName, count: 1, difficulty })) }
        const r = await api.post('/api/loot/suggest', payload)
        data = r.data as any[]
      }
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
      // build flat list of indices but prioritize single-upgrade-only items
      const allIndices: number[] = []
      grouped.forEach(indices => allIndices.push(...indices))
      // use local meta object (not the state) to avoid relying on async state updates
      const localMeta = meta
      const singleIdx = allIndices.filter(i => localMeta[i]?.singleUpgradeOnly)
      const normalIdx = allIndices.filter(i => !localMeta[i]?.singleUpgradeOnly)
      const globalUsed = new Set<string>()
      // for each group, assign distinct top candidates across the group's indices
      grouped.forEach(indices => {
        const candidates = map[indices[0]] || []
        const upgradeCandidates = candidates.filter(c => c.itemPercentage > 0)
        // sort by priority then itemPercentage so we pick the best available per slot
        upgradeCandidates.sort((a, b) => (b.priority - a.priority) || (b.itemPercentage - a.itemPercentage))
        if (upgradeCandidates.length === 0) return
        for (const itemIdx of indices) {
          // if this unit is single-upgrade-only, assign the top candidate even if already used elsewhere
          const isSingle = localMeta[itemIdx]?.singleUpgradeOnly
          let found = upgradeCandidates.find(c => !globalUsed.has(normalizeName(c.characterName)))
          if (!found && isSingle) {
            // pick top candidate regardless of globalUsed, but do not mark as used globally
            found = upgradeCandidates[0]
            assignMap[itemIdx] = found.characterName
            // do NOT add to globalUsed so this 'free' assignment doesn't block others
          } else if (found) {
            assignMap[itemIdx] = found.characterName
            // only reserve globally if this was a competitive assignment
            globalUsed.add(normalizeName(found.characterName))
          }
        }
      })
      setAssignments(assignMap)
      // initialize reserved map from prefill (normalized keys)
      const initReserved: Record<string, boolean> = {}
      Object.entries(assignMap).forEach(([k, v]) => {
        const idx = Number(k)
        if (!v) return
        // do not reserve single-upgrade-only assignments (they are free and shouldn't block others)
        if (localMeta[idx]?.singleUpgradeOnly) return
        initReserved[normalizeName(v)] = true
      })
      setReservedMap(initReserved)
      console.log('[goSuggest] prefill', { map, meta, assignMap, initReserved })
      // detailed per-index debug
      allocItems.forEach((_, idx) => {
        const itemKeyLocal = getItemKey(allocItems[idx])
        const groupIndicesLocal = allocItems.reduce<number[]>((acc, item, i) => { if (getItemKey(item) === itemKeyLocal) acc.push(i); return acc }, [])
        const groupPosition = groupIndicesLocal.indexOf(idx)
        const cand = map[idx] || []
        const assignedElsewhere = Object.entries(assignMap).filter(([k, v]) => v && Number(k) !== idx).map(([k, v]) => v)
        console.log('[goSuggest:index]', { idx, itemKeyLocal, groupIndicesLocal, groupPosition, candidates: cand.slice(0,6), assignedElsewhere, assignedPrefill: assignMap[idx], reservedInit: initReserved })
      })
        // resolve localized item names if lang != en
        if (lang !== 'en') {
          const ids = payloadUnits.map(u => u.itemId).filter((id): id is number => id != null && !itemNameMap[id])
          const unique = [...new Set(ids)]
          if (unique.length > 0) {
            api.post('/api/loot/item-names', { ids: unique, locale: lang === 'pt' ? 'pt_BR' : 'en_US' })
              .then(res => {
                const names = res.data as Record<number, string | null>
                setItemNameMap(prev => {
                  const next = { ...prev }
                  for (const [k, v] of Object.entries(names)) { if (v) next[Number(k)] = v }
                  return next
                })
              }).catch(() => {})
          }
        }
      } catch (e) {
        console.error(e)
      } finally { setLoading(false) }
    }

    const getTransmogStatus = (idx: number) => {
    const meta = suggestionMeta[idx]
    const candidates = suggestions[idx] || []
    const itemKey = getItemKey(allocItems[idx])
    const groupIndices = allocItems.reduce<number[]>((acc, item, i) => {
      if (getItemKey(item) === itemKey) acc.push(i)
      return acc
    }, [])
    const groupPosition = groupIndices.indexOf(idx)

    // assigned names on indices outside this group (normalized)
    const assignedElsewhereFromOthers = new Set<string>()
    Object.entries(assignments).forEach(([k, v]) => {
      const ki = Number(k)
      if (!v) return
      // skip assignments that are inside this group
      if (groupIndices.includes(ki)) return
      // skip single-upgrade-only assignments (they are free and shouldn't block others)
      if (suggestionMeta[ki]?.singleUpgradeOnly) return
      assignedElsewhereFromOthers.add(normalizeName(v))
    })
    // include reserved names that are not already assigned within this group
    const groupAssignedNames = new Set<string>()
    Object.entries(assignments).forEach(([k, v]) => {
      const ki = Number(k)
      if (!v) return
      if (groupIndices.includes(ki)) groupAssignedNames.add(normalizeName(v))
      else if (!suggestionMeta[ki]?.singleUpgradeOnly) assignedElsewhereFromOthers.add(normalizeName(v))
    })
    Object.keys(reservedMap || {}).forEach(n => {
      if (!groupAssignedNames.has(n)) assignedElsewhereFromOthers.add(n)
    })

    // candidate normalized names for this item
    const candidateNames = new Set<string>()
    for (const c of candidates) if (c.itemPercentage > 0) candidateNames.add(normalizeName(c.characterName))

    // available names are candidate names minus assigned elsewhere (others)
    const availableNames = new Set<string>()
    candidateNames.forEach(n => { if (!assignedElsewhereFromOthers.has(n)) availableNames.add(n) })

    // union with names already assigned within this group (so they count toward upgrade slots)
    const uniqueUpgradeNames = new Set<string>([...availableNames, ...Array.from(groupAssignedNames)])

    const upgradeCandidates = meta?.singleUpgradeOnly
      ? candidates.filter(c => c.itemPercentage > 0)
      : candidates.filter(c => c.itemPercentage > 0 && !assignedElsewhereFromOthers.has(normalizeName(c.characterName)))

    const isTransmog = !!meta?.allZeroUpgrade || groupPosition >= uniqueUpgradeNames.size
    return { isTransmog, upgradeCandidates }
  }

  useEffect(() => {
    if (allocItems.length === 0) return
    let changed = false
    const updated = { ...assignments }
    allocItems.forEach((_, idx) => {
      if (getTransmogStatus(idx).isTransmog && updated[idx]) {
        // clear assignment if candidate is now considered transmog due to selection elsewhere
        updated[idx] = ''
        changed = true
      }
    })
    if (changed) setAssignments(updated)
    // if any assignments were cleared, also update reservedMap to reflect current assignments
    const newReserved: Record<string, boolean> = {}
    Object.entries(updated).forEach(([k, v]) => {
      const ki = Number(k)
      if (!v) return
      // do not reserve single-upgrade-only assignments (they are free)
      if (suggestionMeta[ki]?.singleUpgradeOnly) return
      newReserved[normalizeName(v)] = true
    })
    setReservedMap(newReserved)
  }, [allocItems, suggestionMeta, suggestions, assignments])

  const doDistribute = async () => {
    // use allocItems which represents each unit separately
    const allocations = allocItems.map((it, idx) => ({
      itemId: it.itemId,
      itemName: it.itemName,
      assignedTo: getTransmogStatus(idx).isTransmog ? '' : (assignments[idx] || ''),
      boss,
      difficulty,
      note: itemNotes[idx] || undefined,
      isSingleUpgrade: !!suggestionMeta[idx]?.singleUpgradeOnly,
    }))
    try {
      if (isDemoMode()) {
        const drops = allocations.map((a, i) => ({
          id: `demo-${Date.now()}-${i}`,
          itemName: a.itemName,
          assignedTo: a.assignedTo,
          boss: a.boss,
          difficulty: a.difficulty,
          // award depends on difficulty (normal=0.5, heroic=1.0, mythic=1.5)
          awardValue: (!a.assignedTo || a.isSingleUpgrade) ? 0 : (a.difficulty === 'normal' ? 0.5 : a.difficulty === 'mythic' ? 1.5 : 1.0),
          note: a.note || '',
          createdAt: new Date().toISOString(),
        }))
        addDemoLootHistory(drops)
        showToast(`${drops.length} ${t('loot.distributed')}`)
      } else {
        const r = await api.post('/api/loot/distribute', { allocations })
        showToast(`${r.data.distributed} ${t('loot.distributed')}`)
      }
      // reset
      setSelectedItems([])
      setSuggestions({})
      setSuggestionMeta({})
      setAssignments({})
      setItemNotes({})
      setNoteOpenIdx(null)
      setStep(1)
    } catch (e) {
      console.error(e)
      showAlert(t('loot.distributeError'))
    }
  }

  return (
    <div className="tab-content">
      <div className="card tab-card loot-panel loot-panel--container">
        {initialLoading && <Skeleton count={4} />}
        {!initialLoading && (
          <div className="loot-stepper">
            <div className={`loot-step ${step === 1 ? 'loot-step--active' : 'loot-step--done'}`}>
              <div className="loot-step-num">{step > 1 ? '✓' : '1'}</div>
              <span className="loot-step-label">{t('loot.step1Desc')}</span>
            </div>
            <div className={`loot-step-line ${step > 1 ? 'loot-step-line--done' : ''}`} />
            <div className={`loot-step ${step === 2 ? 'loot-step--active' : ''}`}>
              <div className="loot-step-num">2</div>
              <span className="loot-step-label">{t('loot.step2Desc')}</span>
            </div>
          </div>
        )}
        {!initialLoading && step === 1 && (
          <div className="loot-root">
            <div className="loot-top-row">
              <div className="loot-raid-column">
                {/* Difficulty buttons — vertical */}
                <div className="difficulty-column">
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
                      className={"difficulty-btn" + (difficulty === d ? ' active' : '')}>{d === 'normal' ? 'N' : d === 'heroic' ? 'H' : 'M'}</button>
                  ))}
                </div>

                <div className="raid-list">
                  {raidList.length === 0 && <div style={{ color: 'var(--muted)' }}>{t('loot.selectDiffToLoad')}</div>}
                  {raidList.map(instName => {
                    const img = getRaidImage(instName)
                    const disabled = !difficulty
                    return (
                      <div key={instName} className={`raid-item ${raid === instName ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
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
                        style={{ cursor: disabled ? 'default' : 'pointer' }}
                      >
                        <div className="raid-thumb" style={{ background: img ? `url(${img}) center/cover no-repeat` : 'rgba(var(--accent-rgb),0.06)', position: 'relative' }}>
                          <div className="raid-thumb-label" style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            bottom: 0,
                            padding: '8px 10px',
                            background: 'rgba(0,0,0,0.7)',
                            textAlign: 'center',
                            fontSize: 13,
                            fontWeight: 700,
                            color: '#fff',
                            borderRadius: '0 0 10px 10px',
                            boxSizing: 'border-box',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>{instName}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* show side bosses only on narrow screens */}
              {windowWidth < 900 && (
                <div className="loot-boss-column boss-side" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {raid && (
                    <>
                      <div style={{ marginBottom: 8, fontSize: 15 }}><strong>{t('loot.raid')}:</strong> {raid}</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {bossList.length > 0 ? (
                          bossList.map(b => {
                            const img = getBossImageUrl(b)
                            return (
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
                                className="boss-select-btn"
                                style={{ padding: '6px 8px', borderRadius: 6, border: boss === b ? '2px solid #10b981' : '1px solid var(--border)', background: boss === b ? 'rgba(16,185,129,0.06)' : 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, boxSizing: 'border-box' }}
                              >
                                {img ? (
                                  <img src={img} alt={b} className="loot-boss-large" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                                ) : null}
                                <span style={{ fontSize: 12, textAlign: 'center', display: 'block', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b}</span>
                              </button>
                            )
                          })
                        ) : (
                          <div>{t('loot.noBoss')}</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            {/* show bottom bosses only on wider screens */}
            {windowWidth >= 900 && raid && (
              <div className="boss-bottom" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {/*<div style={{ marginBottom: 8, fontSize: 15 }}><strong>{t('loot.raid')}:</strong> {raid}</div>*/}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {bossList.length > 0 ? (
                    bossList.map(b => {
                      const img = getBossImageUrl(b)
                      return (
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
                  className="boss-select-btn"
                  style={{ padding: '6px 8px', borderRadius: 6, border: boss === b ? '2px solid #10b981' : '1px solid var(--border)', background: boss === b ? 'rgba(16,185,129,0.06)' : 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, boxSizing: 'border-box' }}
                        >
                          {img ? (
                            <img src={img} alt={b} className="loot-boss-large" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                          ) : null}
                          <span style={{ fontSize: 12, textAlign: 'center', display: 'block', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b}</span>
                        </button>
                      )
                    })
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
                      <div key={i} className={"item-card" + (sel ? ' selected' : '')} onClick={() => onItemClick(it)} onContextMenu={(e) => onItemRightClick(e, it)} onMouseDown={e => e.preventDefault()}>
                        {it.icon ? <img src={it.icon} alt="" className="item-icon" draggable={false} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} /> : <div className="item-icon placeholder" />}
                        <div className="item-body">
                          <div className="item-name">{(it.id && itemNameMap[it.id]) ? itemNameMap[it.id] : it.name}</div>
                        </div>
                        {sel && <div className="item-count">{sel.count}</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="actions-row">
              <button className="primary" onClick={() => goSuggest()} disabled={selectedItems.length === 0 || !boss || !difficulty || loading}>{t('loot.next')}</button>
            </div>
          </div>
        )}

        {!initialLoading && step === 2 && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {loading && suggestions && Object.keys(suggestions).length === 0 && (
              <div className="spinner-row"><Spinner size={36} /></div>
            )}
            <div className="suggestions-scroll">
            <div className="suggestions-grid">
              {allocItems.map((it, idx) => {
                const allCandidates = suggestions[idx] || []
                const baseUpgradeCandidates = allCandidates.filter(c => c.itemPercentage > 0)
                // compute group indices for this item key
                const itemKeyLocal = getItemKey(it)
                const groupIndicesLocal = allocItems.reduce<number[]>((acc, item, i) => { if (getItemKey(item) === itemKeyLocal) acc.push(i); return acc }, [])
                // compute assigned elsewhere (excluding indices in this group) using normalized names
                const assignedElsewhereFromOthers = new Set<string>()
                const groupAssignedNamesLocal = new Set<string>()
                Object.entries(assignments).forEach(([k, v]) => {
                  const ki = Number(k)
                  if (!v) return
                  if (groupIndicesLocal.includes(ki)) {
                    groupAssignedNamesLocal.add(normalizeName(v))
                  } else {
                    // skip single-upgrade-only assignments (they're free and shouldn't block others)
                    if (suggestionMeta[ki]?.singleUpgradeOnly) return
                    assignedElsewhereFromOthers.add(normalizeName(v))
                  }
                })
                // include reserved names not already assigned inside the group
                Object.keys(reservedMap || {}).forEach(n => { if (!groupAssignedNamesLocal.has(n)) assignedElsewhereFromOthers.add(n) })
                // if this item is single-upgrade-only, do not exclude the single candidate
                const singleUpgrade = suggestionMeta[idx]?.singleUpgradeOnly
                // show all upgrade candidates, even if they're already selected elsewhere — we'll visually mark those
                const visibleUpgrades = singleUpgrade
                  ? baseUpgradeCandidates
                  : baseUpgradeCandidates
                // sort upgrade candidates by priority (highest first), then by itemPercentage as tiebreaker
                const sortedUpgrades = [...visibleUpgrades].sort((a, b) => (b.priority - a.priority) || (b.itemPercentage - a.itemPercentage))
                // show only upgrade candidates in the primary buttons
                const topCandidates = sortedUpgrades.slice(0, 5)
                const { isTransmog } = getTransmogStatus(idx)
                const isAllowDup = allowDuplicateItems.has(idx)
                return (
                  <div key={idx} className="card suggestion-card">
                    <div className="suggestion-header">
                      {it.icon ? <img src={it.icon} alt="" className="suggestion-icon" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} /> : <div className="suggestion-icon placeholder" />}
                      <div className="suggestion-title">{(it.itemId && itemNameMap[it.itemId]) ? itemNameMap[it.itemId] : it.itemName}</div>
                      <button
                        className={"allow-dup-toggle" + (isAllowDup ? ' active' : '')}
                        title={isAllowDup ? t('loot.dupOn') : t('loot.dupOff')}
                        onClick={e => {
                          e.stopPropagation()
                          const wasActive = allowDuplicateItems.has(idx)
                          setAllowDuplicateItems(prev => {
                            const next = new Set(prev)
                            if (next.has(idx)) next.delete(idx); else next.add(idx)
                            return next
                          })
                          // when deactivating: if current assignee is also assigned elsewhere, clear and pick next best
                          if (wasActive && assignments[idx]) {
                            const currentName = normalizeName(assignments[idx])
                            const isUsedElsewhere = Object.entries(assignments).some(([k, v]) => {
                              const ki = Number(k)
                              return ki !== idx && normalizeName(v) === currentName && !suggestionMeta[ki]?.singleUpgradeOnly
                            })
                            if (isUsedElsewhere) {
                              const updated = { ...assignments }
                              updated[idx] = ''
                              const usedNames = new Set<string>()
                              Object.entries(updated).forEach(([k, v]) => {
                                if (!v || Number(k) === idx) return
                                if (suggestionMeta[Number(k)]?.singleUpgradeOnly) return
                                usedNames.add(normalizeName(v))
                              })
                              const cands = suggestions[idx] || []
                              const sorted = [...cands].filter(c => c.itemPercentage > 0).sort((a, b) => (b.priority - a.priority) || (b.itemPercentage - a.itemPercentage))
                              const nextBest = sorted.find(c => !usedNames.has(normalizeName(c.characterName)))
                              if (nextBest) updated[idx] = nextBest.characterName
                              setAssignments(updated)
                              const newReserved: Record<string, boolean> = {}
                              Object.entries(updated).forEach(([k, v]) => {
                                const ki = Number(k)
                                if (!v) return
                                if (suggestionMeta[ki]?.singleUpgradeOnly) return
                                newReserved[normalizeName(v)] = true
                              })
                              setReservedMap(newReserved)
                            }
                          }
                        }}
                      />
                    </div>
                    {isTransmog && (
                      <div style={{ color: 'var(--color-transmog)', fontWeight: 700, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center', padding: '4px 0' }}>TRANSMOG</div>
                    )}
                    {!isTransmog && (
                      <div className="suggestion-body">
                        <div className="candidates-list">
                          {topCandidates.map((c: any, cIdx: number) => {
                            const isSelected = normalizeName(assignments[idx]) === normalizeName(c.characterName)
                            const classIcon = getClassIconUrl(c.class)
                            const classColor = getClassColor(c.class, theme)
                            const isAssignedElsewhere = !isAllowDup && assignedElsewhereFromOthers.has(normalizeName(c.characterName)) && !isSelected
                            const prioColor = getPriorityColor(cIdx, topCandidates.length)
                            const allPcts = topCandidates.map((x: any) => Number(x.itemPercentage))
                            const upgrColor = getUpgradeColor(Number(c.itemPercentage), allPcts)
                            // check iLevel below minimum for selected difficulty
                            const charData = chars.find((ch: any) => ch.name === c.characterName)
                            const charIlvl = charData?.itemLevel ?? 0
                            const minIlvl = difficulty === 'normal' ? (guild?.minIlevelNormal ?? 0) : difficulty === 'heroic' ? (guild?.minIlevelHeroic ?? 0) : difficulty === 'mythic' ? (guild?.minIlevelMythic ?? 0) : 0
                            const isBelowIlvl = minIlvl > 0 && charIlvl > 0 && charIlvl < minIlvl
                              return (
                              <button key={c.characterName} className={"candidate-btn" + (isSelected ? ' selected' : '') + (isAssignedElsewhere ? ' assigned-elsewhere' : '')} onClick={() => assignToIndex(idx, c.characterName)} title={`Upgrade: ${Number(c.itemPercentage).toFixed(2)}% | Score: ${Number(c.overallScore).toFixed(2)} | Itens recebidos (30d): ${c.lootReceivedCount} | Priority: ${Number(c.priority).toFixed(4)}${charIlvl > 0 ? ` | iLvl: ${charIlvl}` : ''}${isBelowIlvl ? ` ⚠ min ${minIlvl}` : ''}${isAssignedElsewhere ? ' | Selecionado em outro item' : ''}`}>
                                {isAssignedElsewhere && (<span className="badge badge-assigned">Já selecionado</span>)}
                                <span className="candidate-name">
                                  {classIcon && <img src={classIcon} alt="" className="candidate-class-icon" />}
                                  <span className="class-color-text" style={{ color: classColor }}>{c.characterName}</span>
                                  {isSelected && <span className="badge badge-selected">✓</span>}
                                  {isBelowIlvl && <span className="badge badge-ilvl-warn" title={`iLvl ${charIlvl} < ${minIlvl}`}>⚠️</span>}
                                </span>
                                <span className="candidate-meta">
                                  <span className="badge badge-upgrade" style={{ color: upgrColor }}>⬆{Number(c.itemPercentage).toFixed(2)}%</span>
                                  <span className="badge badge-priority" style={{ color: prioColor }}>P:{Math.round(c.priority * 100)}</span>
                                </span>
                              </button>
                            )
                          })}
                        </div>
                        {sortedUpgrades.length > 5 && (
                          <select className="candidate-select" value={assignments[idx] || ''} onChange={e => assignToIndex(idx, e.target.value)}>
                            <option value="">{t('loot.choose')}</option>
                            {sortedUpgrades.slice(0, 12).map((c) => {
                              const classLabel = c.class ? ` (${getClassNameLocalized(c.class, lang)})` : ''
                              return (
                                <option key={c.characterName} value={c.characterName}>{c.characterName}{classLabel} — ⬆{Number(c.itemPercentage).toFixed(2)}% · P:{Math.round(c.priority * 100)}</option>
                              )
                            })}
                          </select>
                        )}
                      </div>
                    )}
                    {/* Per-item note icon */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', position: 'relative' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setNoteOpenIdx(noteOpenIdx === idx ? null : idx) }}
                        title={t('loot.note')}
                        style={{
                          background: itemNotes[idx] ? 'rgba(var(--accent-rgb),0.15)' : 'transparent',
                          border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 6px', borderRadius: 4,
                          color: itemNotes[idx] ? 'var(--accent)' : 'var(--muted)',
                        }}
                      >ℹ️</button>
                      {noteOpenIdx === idx && (
                        <div style={{
                          position: 'absolute', bottom: 24, right: 0, zIndex: 10,
                          background: 'var(--card)', border: '1px solid var(--accent)', borderRadius: 8,
                          padding: 8, minWidth: 200, boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
                        }}>
                          <textarea
                            value={itemNotes[idx] || ''}
                            onChange={e => setItemNotes({ ...itemNotes, [idx]: e.target.value })}
                            placeholder={t('loot.notePlaceholder')}
                            rows={2}
                            autoFocus
                            onClick={e => e.stopPropagation()}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--select-bg)', color: 'var(--text)', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            </div>

            <div style={{ padding: '12px 0 4px', display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button onClick={() => setStep(1)}>{t('loot.back')}</button>
              <button onClick={doDistribute} style={{ padding: '10px 32px', fontSize: 15, borderRadius: 8, border: '1px solid rgba(var(--accent-rgb),0.4)', background: 'rgba(var(--accent-rgb),0.12)' }}>{t('loot.distribute')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
