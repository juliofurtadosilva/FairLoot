// Static boss map: display boss name -> zamimg filename
// Keep the two example filenames prefilled; other bosses are listed with
// empty filename placeholders so you can provide the correct zamimg file
// (for example "ui-ej-boss-host-general.png").
import api from './api'

type BossMap = Record<string, string>

const bossMap: BossMap = {
  // prefilled examples (do not change unless you know the zamimg filename)
    "Imperator Averzian": "ui-ej-boss-host-general.png",
    "Vorasius": "ui-ej-boss-kaiju.png",
    "Fallen-King Salhadaar": "ui-ej-boss-salhadaar.png",
    "Vaelgor & Ezzorak": "ui-ej-boss-dragon-duo.png",
    "Lightblinded Vanguard": "ui-ej-boss-paladin-trio.png",
    "Crown of the Cosmos": "ui-ej-boss-alleria.png",
    "Chimaerus": "ui-ej-boss-malformed-manifestation.png",
    "Belo'ren, Child of Al'ar": "ui-ej-boss-light-void-phoenix.png",
    "Midnight Falls": "ui-ej-boss-lura-midnight.png",
}

export function addBossMapping(bossName: string, zamFileName: string) {
  if (!bossName) return
  bossMap[bossName] = zamFileName || ''
}

// per-guild overrides fetched from the backend (admin-editable, see AdminPanel raid-images section) —
// take priority over the hardcoded map above so new raids/bosses don't need a code deploy.
let bossOverrides: BossMap = {}
let raidOverrides: BossMap = {}

export function setImageOverrides(images: { entityType: string; name: string; imageFile: string }[]) {
  const bosses: BossMap = {}
  const raids: BossMap = {}
  for (const img of images) {
    if (!img.name || !img.imageFile) continue
    if (img.entityType === 'raid') raids[img.name] = img.imageFile
    else bosses[img.name] = img.imageFile
  }
  bossOverrides = bosses
  raidOverrides = raids
}

export function getBossImageUrl(bossName?: string): string | null {
  if (!bossName) return null
  const file = bossOverrides[bossName] || bossMap[bossName]
  if (!file) return null
  return `https://wow.zamimg.com/images/wow/journal/${file}`
}

export function getRaidImageOverrideUrl(raidName?: string): string | null {
  if (!raidName) return null
  const file = raidOverrides[raidName]
  if (!file) return null
  return `https://wow.zamimg.com/images/wow/journal/${file}`
}

// Automatic resolution via the Blizzard Journal API (raid/boss name -> official render), so new
// raids/bosses show art without any manual entry. Results are cached in-memory for the session.
const autoRaidImageCache = new Map<string, string | null>()
const autoBossImageCache = new Map<string, string | null>()

// Note: only successful (truthy) resolutions are cached — a failed/empty lookup is never cached client-side,
// so a transient hiccup (or a call made before the backend was ready) doesn't permanently block that raid/boss
// for the rest of the session. The backend already has its own short-lived null-cache, so retries stay cheap.
export async function resolveRaidImageAuto(raidName: string): Promise<string | null> {
  if (autoRaidImageCache.has(raidName)) return autoRaidImageCache.get(raidName)!
  try {
    const res = await api.post('/api/loot/raid-image', { raidName })
    const url = res.data?.url || null
    if (url) autoRaidImageCache.set(raidName, url)
    return url
  } catch {
    return null
  }
}

export async function resolveBossImageAuto(raidName: string | undefined, bossName: string): Promise<string | null> {
  const key = `${raidName || ''}||${bossName}`
  if (autoBossImageCache.has(key)) return autoBossImageCache.get(key)!
  try {
    const res = await api.post('/api/loot/boss-image', { raidName: raidName || undefined, bossName })
    const url = res.data?.url || null
    if (url) autoBossImageCache.set(key, url)
    return url
  } catch {
    return null
  }
}

// Localized raid/boss display names via the Blizzard Journal API (same matching as the image
// resolvers above) — WowAudit only ever gives us English names, so PT needs a translated label too.
const autoRaidNameCache = new Map<string, string | null>()
const autoBossNameCache = new Map<string, string | null>()

export async function resolveRaidNameAuto(raidName: string, locale: string): Promise<string | null> {
  const key = `${locale}||${raidName}`
  if (autoRaidNameCache.has(key)) return autoRaidNameCache.get(key)!
  try {
    const res = await api.post('/api/loot/raid-name', { raidName, locale })
    const name = res.data?.name || null
    if (name) autoRaidNameCache.set(key, name)
    return name
  } catch {
    return null
  }
}

export async function resolveBossNameAuto(raidName: string | undefined, bossName: string, locale: string): Promise<string | null> {
  const key = `${locale}||${raidName || ''}||${bossName}`
  if (autoBossNameCache.has(key)) return autoBossNameCache.get(key)!
  try {
    const res = await api.post('/api/loot/boss-name', { raidName: raidName || undefined, bossName, locale })
    const name = res.data?.name || null
    if (name) autoBossNameCache.set(key, name)
    return name
  } catch {
    return null
  }
}

export default bossMap
