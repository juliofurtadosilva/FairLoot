import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// ─── Theme ───────────────────────────────────────────────────────────
export type Theme = 'dark' | 'light'

// ─── Language ────────────────────────────────────────────────────────
export type Lang = 'pt' | 'en'

const translations = {
  // nav / tabs
  'nav.loot': { pt: 'Controle de Loot', en: 'Loot Control' },
  'nav.members': { pt: 'Membros', en: 'Members' },
  'nav.wishlist': { pt: 'Wishlist', en: 'Wishlist' },
  'nav.history': { pt: 'Histórico', en: 'History' },
  'nav.admin': { pt: 'Admin', en: 'Admin' },
  'nav.logout': { pt: 'Logout', en: 'Logout' },

  // home
  'home.welcome': { pt: 'Bem-vindo ao FairLoot', en: 'Welcome to FairLoot' },
  'home.subtitle': { pt: 'Gerencie loot, membros e regras da sua guild.', en: 'Manage loot, members and guild rules.' },
  'home.login': { pt: 'Entrar', en: 'Login' },
  'home.register': { pt: 'Registrar', en: 'Register' },

  // dashboard
  'dash.welcome': { pt: 'Bem-vindo ao FairLoot!', en: 'Welcome to FairLoot!' },
  'dash.subtitle': { pt: 'Sistema justo de distribuição de loot para sua guild. Veja como funciona:', en: 'Fair loot distribution system for your guild. Here\'s how it works:' },
  'dash.step1Title': { pt: 'Wishlist via WowAudit', en: 'Wishlist via WowAudit' },
  'dash.step1Desc': { pt: 'Os membros da guild preenchem suas wishlists no WowAudit. O FairLoot importa automaticamente esses dados para saber quais itens são upgrade para cada jogador.', en: 'Guild members fill their wishlists on WowAudit. FairLoot automatically imports this data to know which items are upgrades for each player.' },
  'dash.step2Title': { pt: 'Controle de Loot', en: 'Loot Control' },
  'dash.step2Desc': { pt: 'Durante a raid, o Admin seleciona a dificuldade, boss e os itens que droparam. O sistema calcula a prioridade de cada jogador com base no upgrade (α), score acumulado (β) e loot recente (γ).', en: 'During the raid, the Admin selects the difficulty, boss, and dropped items. The system calculates each player\'s priority based on upgrade (α), accumulated score (β), and recent loot (γ).' },
  'dash.step3Title': { pt: 'Distribuição Justa', en: 'Fair Distribution' },
  'dash.step3Desc': { pt: 'O sistema sugere automaticamente quem deve receber cada item. O Admin pode ajustar e confirmar. Itens sem upgrade viram transmog. Todo o histórico fica registrado.', en: 'The system automatically suggests who should receive each item. The Admin can adjust and confirm. Items with no upgrade become transmog. All history is recorded.' },

  // login
  'login.title': { pt: 'Login', en: 'Login' },
  'login.email': { pt: 'Email', en: 'Email' },
  'login.password': { pt: 'Senha', en: 'Password' },
  'login.submit': { pt: 'Entrar', en: 'Login' },
  'login.error': { pt: 'Erro no login', en: 'Login error' },

  // members
  'members.title': { pt: 'Membros da Guild', en: 'Guild Members' },
  'members.active': { pt: 'Ativos', en: 'Active' },
  'members.pending': { pt: 'Pendentes', en: 'Pending' },
  'members.role': { pt: 'cargo', en: 'role' },
  'members.noPending': { pt: 'Nenhuma solicitação', en: 'No pending requests' },
  'members.approve': { pt: 'Aprovar', en: 'Approve' },
  'members.remove': { pt: 'Remover', en: 'Remove' },
  'members.confirmRemove': { pt: 'Remover este membro da guild?', en: 'Remove this member from the guild?' },
  'members.errorFetch': { pt: 'Erro ao buscar membros', en: 'Error fetching members' },
  'members.errorApprove': { pt: 'Erro ao aprovar', en: 'Error approving' },
  'members.errorRemove': { pt: 'Erro ao remover', en: 'Error removing' },

  // wishlist
  'wishlist.title': { pt: 'Wishlist (WowAudit)', en: 'Wishlist (WowAudit)' },
  'wishlist.search': { pt: '🔍 Buscar jogador...', en: '🔍 Search player...' },
  'wishlist.allRaids': { pt: 'Todas raids', en: 'All raids' },
  'wishlist.players': { pt: 'jogadores', en: 'players' },
  'wishlist.player': { pt: 'jogador', en: 'player' },
  'wishlist.noPlayer': { pt: 'Nenhum jogador encontrado.', en: 'No player found.' },
  'wishlist.error': { pt: 'Erro ao buscar wishlist', en: 'Error fetching wishlist' },

  // loot
  'loot.step': { pt: 'Passo', en: 'Step' },
  'loot.step1Desc': { pt: 'Escolha dificuldade / boss / itens', en: 'Choose difficulty / boss / items' },
  'loot.step2Desc': { pt: 'Sugestões e distribuição', en: 'Suggestions and distribution' },
  'loot.difficulty': { pt: 'Dificuldade:', en: 'Difficulty:' },
  'loot.instanceBoss': { pt: 'Instância / Boss:', en: 'Instance / Boss:' },
  'loot.selectDiffToLoad': { pt: 'Selecione uma dificuldade para carregar raids', en: 'Select a difficulty to load raids' },
  'loot.raid': { pt: 'Raid', en: 'Raid' },
  'loot.qty': { pt: 'Qtd', en: 'Qty' },
  'loot.selectDifficulty': { pt: 'Dificuldade', en: 'Difficulty' },
  'loot.available': { pt: 'Itens disponíveis:', en: 'Available items:' },
  'loot.selectRaidBoss': { pt: 'Selecione uma Raid e um Boss.', en: 'Select a Raid and Boss.' },
  'loot.noItems': { pt: 'Nenhum item encontrado para seleção.', en: 'No items found.' },
  'loot.noBoss': { pt: 'Nenhum boss encontrado', en: 'No boss found' },
  'loot.next': { pt: 'Próximo', en: 'Next' },
  'loot.back': { pt: 'Voltar', en: 'Back' },
  'loot.distribute': { pt: 'Distribuir', en: 'Distribute' },
  'loot.loading': { pt: 'Carregando sugestões...', en: 'Loading suggestions...' },
  'loot.transmog': { pt: 'TRANSMOG', en: 'TRANSMOG' },
  'loot.assignTo': { pt: 'Atribuir a: ', en: 'Assign to: ' },
  'loot.showAll': { pt: 'Mostrar todos', en: 'Show all' },
  'loot.hideList': { pt: 'Ocultar lista', en: 'Hide list' },
  'loot.choose': { pt: '-- escolha --', en: '-- choose --' },
  'loot.allChars': { pt: 'Todos os personagens', en: 'All characters' },
  'loot.distributed': { pt: 'itens distribuídos', en: 'items distributed' },
  'loot.distributeError': { pt: 'Erro ao distribuir', en: 'Error distributing' },

  // history
  'history.title': { pt: 'Histórico de Loot', en: 'Loot History' },
  'history.noRecords': { pt: 'Nenhum registro.', en: 'No records.' },
  'history.to': { pt: 'Para:', en: 'To:' },
  'history.value': { pt: 'Valor:', en: 'Value:' },
  'history.transmog': { pt: 'esse item é transmog', en: 'this item is transmog' },
  'history.at': { pt: 'Em:', en: 'At:' },
  'history.undo': { pt: 'Reverter', en: 'Undo' },
  'history.undoConfirm': { pt: 'Reverter essa distribuição?', en: 'Undo this distribution?' },
  'history.errorFetch': { pt: 'Erro ao buscar histórico', en: 'Error fetching history' },
  'history.errorUndo': { pt: 'Erro ao reverter', en: 'Error undoing' },

  // admin
  'admin.title': { pt: 'Painel Admin', en: 'Admin Panel' },
  'admin.settings': { pt: 'Configurações da Guild', en: 'Guild Settings' },
  'admin.save': { pt: 'Salvar', en: 'Save' },
  'admin.sync': { pt: 'Sincronizar personagens', en: 'Sync characters' },
  'admin.saved': { pt: 'Guild atualizada', en: 'Guild updated' },
  'admin.synced': { pt: 'Sincronizado', en: 'Synced' },
  'admin.syncError': { pt: 'Erro no sync', en: 'Sync error' },
  'admin.saveError': { pt: 'Erro ao salvar', en: 'Error saving' },
  'admin.search': { pt: '🔍 Buscar...', en: '🔍 Search...' },
  'admin.noChar': { pt: 'Nenhum personagem encontrado.', en: 'No character found.' },
  'admin.loading': { pt: 'Carregando...', en: 'Loading...' },
  'admin.characters': { pt: 'Personagens', en: 'Characters' },
  'admin.score': { pt: 'pontos', en: 'score' },
  'admin.helpTitle': { pt: 'Como funciona o cálculo de prioridade', en: 'How priority calculation works' },
  'admin.formula.alphaTitle': { pt: 'α Alpha — Upgrade', en: 'α Alpha — Upgrade' },
  'admin.formula.alphaDesc': {
    pt: 'Quanto o item é upgrade para o jogador (% do WowAudit). Normalizado pelo maior valor entre todos os candidatos.',
    en: 'How much the item is an upgrade for the player (WowAudit %). Normalized by the highest value among all candidates.',
  },
  'admin.formula.alphaHighlight': { pt: 'Maior % de upgrade = maior prioridade.', en: 'Higher upgrade % = higher priority.' },
  'admin.formula.betaTitle': { pt: 'β Beta — Score acumulado', en: 'β Beta — Accumulated score' },
  'admin.formula.betaDesc': {
    pt: 'Soma de todos os itens que o jogador já recebeu (1 ponto por item). Invertido:',
    en: 'Sum of all items the player has received (1 point per item). Inverted:',
  },
  'admin.formula.betaHighlight': {
    pt: 'menor score = maior prioridade',
    en: 'lower score = higher priority',
  },
  'admin.formula.betaSuffix': {
    pt: ', para que quem recebeu menos loot seja favorecido.',
    en: ', so that whoever received less loot is favored.',
  },
  'admin.formula.gammaTitle': { pt: 'γ Gamma — Loot recente (30 dias)', en: 'γ Gamma — Recent loot (30 days)' },
  'admin.formula.gammaDesc': {
    pt: 'Quantidade de itens recebidos nos últimos 30 dias. Invertido:',
    en: 'Number of items received in the last 30 days. Inverted:',
  },
  'admin.formula.gammaHighlight': {
    pt: 'menos itens recentes = maior prioridade',
    en: 'fewer recent items = higher priority',
  },
  'admin.formula.gammaSuffix': {
    pt: ', evitando que um jogador receba muitos itens seguidos.',
    en: ', preventing a player from receiving too many items in a row.',
  },
  'admin.formula.tiebreak': {
    pt: 'se dois jogadores tiverem a mesma prioridade, ganha quem tem maior % de upgrade → menor score → recebeu loot há mais tempo.',
    en: 'if two players have the same priority, the one with higher upgrade % wins → lower score → received loot longer ago.',
  },
  'admin.formula.tiebreakLabel': { pt: 'Desempate:', en: 'Tiebreak:' },
  'admin.formula.tip': {
    pt: 'a soma α + β + γ não precisa ser 1, mas é recomendado. Ex: 0.5/0.25/0.25 prioriza upgrade; 0.33/0.33/0.33 equilibra tudo.',
    en: 'the sum α + β + γ doesn\'t have to equal 1, but it\'s recommended. Ex: 0.5/0.25/0.25 prioritizes upgrade; 0.33/0.33/0.33 balances everything.',
  },
  'admin.formula.tipLabel': { pt: 'Dica:', en: 'Tip:' },
} as const

export type TranslationKey = keyof typeof translations

// ─── Context ─────────────────────────────────────────────────────────
interface AppContextType {
  theme: Theme
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TranslationKey) => string
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem('fl-theme') as Theme) || 'dark')
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('fl-lang') as Lang) || 'pt')

  const setTheme = (t: Theme) => { setThemeState(t); localStorage.setItem('fl-theme', t) }
  const setLang = (l: Lang) => { setLangState(l); localStorage.setItem('fl-lang', l) }
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  const t = (key: TranslationKey): string => {
    const entry = translations[key]
    return entry ? entry[lang] : key
  }

  // apply theme class to <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <AppContext.Provider value={{ theme, setTheme, toggleTheme, lang, setLang, t }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
