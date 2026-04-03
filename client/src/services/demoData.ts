import charactersRaw from '../assets/characters_json.txt?raw'
import wishlistRaw from '../assets/wishlist_json.txt?raw'

export const isDemoMode = (): boolean => sessionStorage.getItem('demoMode') === 'true'

export const enterDemoMode = () => {
  sessionStorage.setItem('demoMode', 'true')
  localStorage.setItem('accessToken', 'demo-token')
}

export const exitDemoMode = () => {
  sessionStorage.removeItem('demoMode')
  sessionStorage.removeItem('demoLootHistory')
  sessionStorage.removeItem('demoCharacters')
  localStorage.removeItem('accessToken')
}

let _parsedCharacters: any[] | null = null
let _parsedWishlist: any | null = null

export const getDemoCharacters = (): any[] => {
  if (!_parsedCharacters) {
    try { _parsedCharacters = JSON.parse(charactersRaw) } catch { _parsedCharacters = [] }
  }
  // merge with any saved state (isNewPlayer flags)
  const saved = sessionStorage.getItem('demoCharacters')
  if (saved) {
    try {
      const flags = JSON.parse(saved) as Record<string, boolean>
      return _parsedCharacters!.map(c => ({ ...c, score: c.score ?? 0, isNewPlayer: flags[c.name] ?? false }))
    } catch {}
  }
  return _parsedCharacters!.map(c => ({ ...c, score: c.score ?? 0, isNewPlayer: false }))
}

export const getDemoWishlistRaw = (): any => {
  if (!_parsedWishlist) {
    try { _parsedWishlist = JSON.parse(wishlistRaw) } catch { _parsedWishlist = { characters: [] } }
  }
  return _parsedWishlist
}

export const getDemoWishlistSummary = (): any[] => {
  const raw = getDemoWishlistRaw()
  const characters = raw.characters || []
  const charLookup = getDemoCharacters()
  const classLookup: Record<string, string> = {}
  charLookup.forEach((c: any) => { if (c.class) classLookup[c.name] = c.class })

  return characters.map((c: any) => {
    const instances = (c.instances || []).map((inst: any) => ({
      name: inst.name,
      difficulties: (inst.difficulties || []).map((d: any) => {
        const wl = d.wishlist || {}
        return {
          difficulty: d.difficulty,
          totalPercentage: wl.total_percentage || 0,
          totalAbsolute: wl.total_absolute || 0,
          encounters: (wl.encounters || []).map((e: any) => ({
            name: e.name,
            encounterPercentage: e.encounter_percentage || 0,
            encounterAbsolute: e.encounter_absolute || 0,
            items: (e.items || []).map((it: any) => {
              const wishes = it.wishes || []
              const wish = wishes[0]
              return {
                name: it.name,
                id: it.id ?? null,
                icon: null,
                percentage: wish ? (wish.percentage || 0) : 0,
                absolute: wish ? (wish.absolute || 0) : 0,
                specialization: wish ? (wish.specialization || null) : null,
              }
            }),
          })),
        }
      }),
    }))

    const allDiffs = instances.flatMap((inst: any) => inst.difficulties)
    const overallPercentage = allDiffs.length > 0
      ? Math.max(...allDiffs.map((d: any) => d.totalPercentage))
      : 0

    return {
      name: c.name,
      realm: c.realm || '',
      class: classLookup[c.name] || '',
      overallPercentage,
      difficulties: allDiffs,
      instances,
    }
  })
}

export const getDemoLootHistory = (): any[] => {
  try {
    const saved = sessionStorage.getItem('demoLootHistory')
    return saved ? JSON.parse(saved) : []
  } catch { return [] }
}

// recompute demo characters' scores based on demo loot history using difficulty multipliers
export const recomputeDemoScores = () => {
  const drops = getDemoLootHistory().filter(d => d.assignedTo && !d.isReverted)
  const chars = getDemoCharacters()
  const scores: Record<string, number> = {}
  for (const c of chars) scores[c.name] = 0
  for (const d of drops) {
    const award = (!d.assignedTo || d.isSingleUpgrade) ? 0 : (d.difficulty === 'normal' ? 0.5 : d.difficulty === 'mythic' ? 1.5 : 1.0)
    if (d.assignedTo) scores[d.assignedTo] = (scores[d.assignedTo] || 0) + award
  }
  // merge scores back
  return chars.map(c => ({ ...c, score: scores[c.name] || 0 }))
}

export const addDemoLootHistory = (drops: any[]) => {
  const current = getDemoLootHistory()
  const updated = [...drops, ...current]
  sessionStorage.setItem('demoLootHistory', JSON.stringify(updated))
}

export const removeDemoLootHistory = (id: string): any => {
  const current = getDemoLootHistory()
  let revertedDrop: any = null
  const updated = current.map((d: any) => {
    if (d.id === id && !d.isReverted) {
      revertedDrop = { ...d }
      return { ...d, isReverted: true, revertedAt: new Date().toISOString() }
    }
    return d
  })
  sessionStorage.setItem('demoLootHistory', JSON.stringify(updated))
  return revertedDrop
}

export const toggleDemoNewPlayer = (name: string) => {
  const saved = sessionStorage.getItem('demoCharacters')
  let flags: Record<string, boolean> = {}
  if (saved) { try { flags = JSON.parse(saved) } catch {} }
  flags[name] = !flags[name]
  sessionStorage.setItem('demoCharacters', JSON.stringify(flags))
}

export const getDemoGuild = (): any => {
  const saved = sessionStorage.getItem('demoGuild')
  if (saved) { try { return JSON.parse(saved) } catch {} }
  return {
    name: 'Demo Guild',
    server: 'Azralon',
    wowauditApiKey: '',
    priorityAlpha: 0.4,
    priorityBeta: 0.3,
    priorityGamma: 0.3,
    minIlevelNormal: 0,
    minIlevelHeroic: 0,
    minIlevelMythic: 0,
  }
}

export const saveDemoGuild = (guild: any) => {
  sessionStorage.setItem('demoGuild', JSON.stringify(guild))
}

// Analyze wishlist for outdated items per character
export const getOutdatedWarnings = (): { name: string; count: number; lastOutdatedTs?: number; className?: string }[] => {
  const raw = getDemoWishlistRaw()
  const characters = raw.characters || []
  const charLookup = getDemoCharacters()
  const classLookup: Record<string, string> = {}
  charLookup.forEach((c: any) => { if (c.class) classLookup[c.name] = c.class })
  const warnings: { name: string; count: number; lastOutdatedTs?: number; className?: string }[] = []

  for (const c of characters) {
    let outdatedCount = 0
    let latestTs: number | undefined
    for (const inst of (c.instances || [])) {
      for (const diff of (inst.difficulties || [])) {
        const wl = diff.wishlist || {}
        // consider wishlist-level timestamps if present
        if (wl.updated_at) {
          for (const tsVal of Object.values(wl.updated_at)) {
            if (tsVal) {
              const ts = new Date(tsVal as string).getTime()
              if (!isNaN(ts)) latestTs = Math.max(latestTs || 0, ts)
            }
          }
        }
        for (const enc of (wl.encounters || [])) {
          for (const item of (enc.items || [])) {
            for (const wish of (item.wishes || [])) {
              if (wish.outdated && wish.outdated.old && wish.outdated.new) {
                outdatedCount++
                if (wish.timestamp) {
                  const ts = new Date(wish.timestamp).getTime()
                  if (!isNaN(ts)) latestTs = Math.max(latestTs || 0, ts)
                }
              }
            }
          }
        }
      }
    }
    if (outdatedCount > 0) {
      warnings.push({ name: c.name, count: outdatedCount, lastOutdatedTs: latestTs, className: classLookup[c.name] })
    }
  }

  return warnings.sort((a, b) => b.count - a.count)
}
