// Maps WoW class names to their Blizzard/zamimg icon URLs

const classIconMap: Record<string, string> = {
  warrior:       'https://wow.zamimg.com/images/wow/icons/medium/classicon_warrior.jpg',
  paladin:       'https://wow.zamimg.com/images/wow/icons/medium/classicon_paladin.jpg',
  hunter:        'https://wow.zamimg.com/images/wow/icons/medium/classicon_hunter.jpg',
  rogue:         'https://wow.zamimg.com/images/wow/icons/medium/classicon_rogue.jpg',
  priest:        'https://wow.zamimg.com/images/wow/icons/medium/classicon_priest.jpg',
  'death knight':'https://wow.zamimg.com/images/wow/icons/medium/classicon_deathknight.jpg',
  shaman:        'https://wow.zamimg.com/images/wow/icons/medium/classicon_shaman.jpg',
  mage:          'https://wow.zamimg.com/images/wow/icons/medium/classicon_mage.jpg',
  warlock:       'https://wow.zamimg.com/images/wow/icons/medium/classicon_warlock.jpg',
  monk:          'https://wow.zamimg.com/images/wow/icons/medium/classicon_monk.jpg',
  druid:         'https://wow.zamimg.com/images/wow/icons/medium/classicon_druid.jpg',
  'demon hunter':'https://wow.zamimg.com/images/wow/icons/medium/classicon_demonhunter.jpg',
  evoker:        'https://wow.zamimg.com/images/wow/icons/medium/classicon_evoker.jpg',
}

export function getClassIconUrl(className?: string): string | null {
  if (!className) return null
  const key = className.trim().toLowerCase()
  return classIconMap[key] || null
}

// Portuguese translations for WoW class names
const classNamePt: Record<string, string> = {
  'death knight': 'Cavaleiro da Morte',
  'demon hunter': 'Caçador de Demônios',
  'druid': 'Druida',
  'evoker': 'Evocador',
  'hunter': 'Caçador',
  'mage': 'Mago',
  'monk': 'Monge',
  'paladin': 'Paladino',
  'priest': 'Sacerdote',
  'rogue': 'Ladino',
  'shaman': 'Xamã',
  'warlock': 'Bruxo',
  'warrior': 'Guerreiro',
}

export function getClassNameLocalized(className?: string, lang: string = 'en'): string {
  if (!className) return '—'
  if (lang === 'pt') {
    const key = className.trim().toLowerCase()
    return classNamePt[key] || className
  }
  return className
}

// WoW class colors (official)
const classColorMap: Record<string, string> = {
  'death knight': '#C41E3A',
  'demon hunter': '#A330C9',
  'druid': '#FF7C0A',
  'evoker': '#33937F',
  'hunter': '#AAD372',
  'mage': '#3FC7EB',
  'monk': '#00FF98',
  'paladin': '#F48CBA',
  'priest': '#FFFFFF',
  'rogue': '#FFF468',
  'shaman': '#0070DD',
  'warlock': '#8788EE',
  'warrior': '#C69B6D',
}

// Darker variants for light backgrounds (high contrast on white/gray)
const classColorLightMap: Record<string, string> = {
  'priest': '#6e6e8a',
  'rogue': '#9e8a00',
  'hunter': '#5b7a1e',
  'monk': '#00875a',
  'mage': '#1a7f9e',
  'paladin': '#b5537a',
}

export function getClassColor(className?: string, theme?: string): string {
  if (!className) return '#e8edff'
  const key = className.trim().toLowerCase()
  if (theme === 'light' && classColorLightMap[key]) return classColorLightMap[key]
  return classColorMap[key] ?? '#e8edff'
}
