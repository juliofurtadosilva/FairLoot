// Static boss map: display boss name -> zamimg filename
// Keep the two example filenames prefilled; other bosses are listed with
// empty filename placeholders so you can provide the correct zamimg file
// (for example "ui-ej-boss-host-general.png").

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

export function getBossImageUrl(bossName?: string): string | null {
  if (!bossName) return null
  const file = bossMap[bossName]
  if (!file) return null
  return `https://wow.zamimg.com/images/wow/journal/${file}`
}

export default bossMap
