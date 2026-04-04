import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import '../components/Modal.scss'
import '../components/Toast.scss'

// ─── Theme ───────────────────────────────────────────────────────────
export type Theme = 'dark' | 'light' | 'classic'

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
  'home.welcome': { pt: 'Bem-vindo(a) ao FairLoot', en: 'Welcome to FairLoot' },
  'home.subtitle': { pt: 'Gerencie loot, membros e regras da sua guild.', en: 'Manage loot, members and guild rules.' },
  'home.login': { pt: 'Entrar', en: 'Login' },
  'home.register': { pt: 'Registrar', en: 'Register' },
  'home.demo': { pt: 'Teste aqui', en: 'Try it here' },
  'home.demoDesc': { pt: 'Versão de observação — nada é salvo.', en: 'Observation mode — nothing is saved.' },

  // dashboard
  'dash.welcome': { pt: 'Bem-vindo(a) ao FairLoot!', en: 'Welcome to FairLoot!' },
  'dash.subtitle': { pt: 'Sistema justo de distribuição de loot para sua guild.', en: 'Fair loot distribution system for your guild.' },
  'dash.featTitle': { pt: '✨ Funcionalidades — v1.0', en: '✨ Features — v1.0' },
  'dash.feat.loot': { pt: 'Controle de Loot', en: 'Loot Control' },
  'dash.feat.lootDesc': { pt: 'Selecione raid, boss e itens. O sistema sugere quem deve receber cada item.', en: 'Select raid, boss, and items. The system suggests who should receive each item.' },
  'dash.feat.wishlist': { pt: 'Wishlist (WowAudit)', en: 'Wishlist (WowAudit)' },
  'dash.feat.wishlistDesc': { pt: 'Importação automática de wishlists com % de upgrade por item.', en: 'Automatic wishlist import with upgrade % per item.' },
  'dash.feat.priority': { pt: 'Algoritmo de Prioridade', en: 'Priority Algorithm' },
  'dash.feat.priorityDesc': { pt: '3 fatores configuráveis: upgrade (α), score acumulado (β), loot recente (γ).', en: '3 configurable factors: upgrade (α), accumulated score (β), recent loot (γ).' },
  'dash.feat.history': { pt: 'Histórico de Loot', en: 'Loot History' },
  'dash.feat.historyDesc': { pt: 'Registro completo de todas as distribuições com opção de reverter.', en: 'Full record of all distributions with undo option.' },
  'dash.feat.members': { pt: 'Gestão de Membros', en: 'Member Management' },
  'dash.feat.membersDesc': { pt: 'Aprovação de novos membros, roles Admin/Reader.', en: 'New member approval, Admin/Reader roles.' },
  'dash.feat.i18n': { pt: 'Multi-idioma + Temas', en: 'Multi-language + Themes' },
  'dash.feat.i18nDesc': { pt: 'Português/English, tema claro, escuro e WoW Clássico.', en: 'Portuguese/English, light, dark and WoW Classic theme.' },
  'dash.changelog': { pt: '📝 O que há de novo?', en: '📝 What\'s new?' },
  'dash.v1date': { pt: 'Março 2026 — Lançamento', en: 'March 2026 — Launch' },
  'dash.v1.item1': { pt: 'Controle de loot com sugestões automáticas de distribuição', en: 'Loot control with automatic distribution suggestions' },
  'dash.v1.item2': { pt: 'Integração com WowAudit (wishlists e personagens)', en: 'WowAudit integration (wishlists and characters)' },
  'dash.v1.item3': { pt: 'Algoritmo de prioridade com 3 fatores configuráveis', en: 'Priority algorithm with 3 configurable factors' },
  'dash.v1.item4': { pt: 'Detecção automática de transmog', en: 'Automatic transmog detection' },
  'dash.v1.item5': { pt: 'Histórico completo com opção de reverter distribuições', en: 'Complete history with undo option' },
  'dash.v1.item6': { pt: 'Deploy em produção (Render + Vercel)', en: 'Production deploy (Render + Vercel)' },
  'dash.step1Title': { pt: 'Wishlist via WowAudit', en: 'Wishlist via WowAudit' },
  'dash.step1Desc': { pt: 'Os membros da guild preenchem suas wishlists no WowAudit. O FairLoot importa automaticamente esses dados para saber quais itens são upgrade para cada jogador.', en: 'Guild members fill their wishlists on WowAudit. FairLoot automatically imports this data to know which items are upgrades for each player.' },
  'dash.step2Title': { pt: 'Controle de Loot', en: 'Loot Control' },
  'dash.step2Desc': { pt: 'Durante a raid, o Admin seleciona a dificuldade, boss e os itens que droparam. O sistema calcula a prioridade de cada jogador com base no upgrade (α), score acumulado (β) e loot recente (γ).', en: 'During the raid, the Admin selects the difficulty, boss, and dropped items. The system calculates each player\'s priority based on upgrade (α), accumulated score (β), and recent loot (γ).' },
  'dash.step3Title': { pt: 'Distribuição Justa', en: 'Fair Distribution' },
  'dash.step3Desc': { pt: 'O sistema sugere automaticamente quem deve receber cada item. O Admin pode ajustar e confirmar. Itens sem upgrade viram transmog. Todo o histórico fica registrado.', en: 'The system automatically suggests who should receive each item. The Admin can adjust and confirm. Items with no upgrade become transmog. All history is recorded.' },
  'dash.outdatedTitle': { pt: '⚠️ SimC Desatualizado', en: '⚠️ Outdated SimC' },
  'dash.outdatedDesc': { pt: 'Os seguintes jogadores têm itens com wishlist desatualizada e precisam atualizar seu SimC:', en: 'The following players have items with outdated wishlist and need to update their SimC:' },
  'dash.outdatedItems': { pt: 'itens desatualizados', en: 'outdated items' },
  'dash.outdatedDay': { pt: 'dia', en: 'day' },
  'dash.outdatedDays': { pt: 'dias', en: 'days' },

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
  'loot.note': { pt: 'Observação', en: 'Note' },
  'loot.notePlaceholder': { pt: 'Ex: trade com fulano, item off-spec...', en: 'E.g.: trade with someone, off-spec item...' },
  'loot.dupOn': { pt: 'Permitindo repetir jogador (clique para desativar)', en: 'Allowing duplicate player (click to disable)' },
  'loot.dupOff': { pt: 'Clique para permitir repetir jogador neste item', en: 'Click to allow duplicate player for this item' },

  // history
  'history.title': { pt: 'Histórico de Loot', en: 'Loot History' },
  'history.noRecords': { pt: 'Nenhum registro.', en: 'No records.' },
  'history.to': { pt: 'Para:', en: 'To:' },
  'history.value': { pt: 'Valor:', en: 'Value:' },
  'history.transmog': { pt: 'Transmog', en: 'Transmog' },
  'history.at': { pt: 'Em:', en: 'At:' },
  'history.note': { pt: 'Obs:', en: 'Note:' },
  'history.undo': { pt: 'Reverter', en: 'Undo' },
  'history.undoConfirm': { pt: 'Reverter essa distribuição?', en: 'Undo this distribution?' },
  'history.errorFetch': { pt: 'Erro ao buscar histórico', en: 'Error fetching history' },
  'history.errorUndo': { pt: 'Erro ao reverter', en: 'Error undoing' },
  'history.filterPlayer': { pt: '🔍 Filtrar por jogador...', en: '🔍 Filter by player...' },
  'history.filterBoss': { pt: 'Todos os bosses', en: 'All bosses' },
  'history.filterDate': { pt: 'Todas as datas', en: 'All dates' },
  'history.reverted': { pt: 'Revertido', en: 'Reverted' },
  'history.scoreAdjusted': { pt: 'Score ajustado', en: 'Score adjusted' },
  'history.redistribute': { pt: 'Redistribuir', en: 'Redistribute' },
  'history.redistributeTitle': { pt: 'Item revertido — redistribuir?', en: 'Item reverted — redistribute?' },
  'history.dismiss': { pt: 'Dispensar', en: 'Dismiss' },
  'history.showReverted': { pt: 'Mostrar revertidos', en: 'Show reverted' },
  'history.delete': { pt: 'Apagar', en: 'Delete' },
  'history.deleteConfirm': { pt: 'Apagar este registro permanentemente?', en: 'Delete this record permanently?' },

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
  'admin.newPlayer': { pt: 'Novo', en: 'New' },
  'admin.helpTitle': { pt: 'Como funciona o cálculo de prioridade', en: 'How priority calculation works' },
  'admin.minIlevel': { pt: 'iLevel mínimo por dificuldade', en: 'Min iLevel per difficulty' },
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
  'admin.preview': { pt: 'Preview ao vivo', en: 'Live preview' },
  'admin.previewDesc': { pt: 'Veja como os pesos afetam a prioridade com um item fictício:', en: 'See how weights affect priority with a sample item:' },
  'admin.wowauditStatus': { pt: 'Status WowAudit', en: 'WowAudit Status' },
  'admin.wowauditConnected': { pt: 'Conectado', en: 'Connected' },
  'admin.wowauditDisconnected': { pt: 'Desconectado', en: 'Disconnected' },
  'admin.wowauditNoKey': { pt: 'Sem API Key', en: 'No API Key' },
  'admin.wowauditChecking': { pt: 'Verificando...', en: 'Checking...' },
  'admin.wowauditChars': { pt: 'personagens', en: 'characters' },
  'admin.seasonFinalize': { pt: 'Finalizar Season', en: 'Finalize Season' },
  'admin.seasonFinalizeConfirm': { pt: 'Finalizar a season atual? Isso vai arquivar o histórico e zerar os scores de todos os personagens.', en: 'Finalize the current season? This will archive the history and reset all character scores.' },
  'admin.seasonFinalizeConfirm2': { pt: '⚠️ TEM CERTEZA? Essa ação é IRREVERSÍVEL. Todos os scores serão zerados e o histórico será arquivado permanentemente.', en: '⚠️ ARE YOU SURE? This action is IRREVERSIBLE. All scores will be reset and history will be permanently archived.' },
  'admin.seasonFinalized': { pt: 'Season finalizada com sucesso!', en: 'Season finalized successfully!' },
  'admin.seasonFinalizeError': { pt: 'Erro ao finalizar season', en: 'Error finalizing season' },
  'admin.seasonCurrent': { pt: 'Season atual', en: 'Current season' },

  // dashboard chart
  'dash.chartTitle': { pt: 'Distribuição de loot — Season atual', en: 'Loot distribution — Current season' },
  'dash.chartItems': { pt: 'itens', en: 'items' },
  'dash.chartNoData': { pt: 'Sem dados de loot recente.', en: 'No recent loot data.' },
  'dash.chartSince': { pt: 'Desde', en: 'Since' },
  'dash.chartTimeline': { pt: 'Timeline de distribuições', en: 'Distribution timeline' },

  // history pagination
  'history.loadMore': { pt: 'Carregar mais', en: 'Load more' },
  'history.showing': { pt: 'Exibindo', en: 'Showing' },
  'history.of': { pt: 'de', en: 'of' },
  'history.season': { pt: 'Season', en: 'Season' },
  'history.allSeasons': { pt: 'Todas as seasons', en: 'All seasons' },
  'history.currentSeason': { pt: 'Season atual', en: 'Current season' },
} as const

export type TranslationKey = keyof typeof translations

// ─── Context ─────────────────────────────────────────────────────────
type ModalState = {
  type: 'alert' | 'confirm'
  message: string
  resolve: (value: boolean) => void
  danger?: boolean
} | null

type ToastType = 'success' | 'error' | 'info'
type ToastItem = { id: number; message: string; type: ToastType }

interface AppContextType {
  theme: Theme
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TranslationKey) => string
  showAlert: (message: string) => Promise<void>
  showConfirm: (message: string, danger?: boolean) => Promise<boolean>
  showToast: (message: string, type?: ToastType) => void
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem('fl-theme') as Theme) || 'dark')
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('fl-lang') as Lang) || 'pt')
  const [modal, setModal] = useState<ModalState>(null)
  const modalResolveRef = useRef<((v: boolean) => void) | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastIdRef = useRef(0)

  const setTheme = (t: Theme) => { setThemeState(t); localStorage.setItem('fl-theme', t) }
  const setLang = (l: Lang) => { setLangState(l); localStorage.setItem('fl-lang', l) }
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : theme === 'light' ? 'classic' : 'dark'
    setTheme(next)
  }

  const t = (key: TranslationKey): string => {
    const entry = translations[key]
    return entry ? entry[lang] : key
  }

  const showAlert = useCallback((message: string): Promise<void> => {
    return new Promise(resolve => {
      modalResolveRef.current = () => resolve()
      setModal({ type: 'alert', message, resolve: () => resolve() })
    })
  }, [])

  const showConfirm = useCallback((message: string, danger?: boolean): Promise<boolean> => {
    return new Promise(resolve => {
      modalResolveRef.current = resolve
      setModal({ type: 'confirm', message, resolve, danger })
    })
  }, [])

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++toastIdRef.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }, [])

  const closeModal = (result: boolean) => {
    modal?.resolve(result)
    setModal(null)
    modalResolveRef.current = null
  }

  // apply theme class to <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // close modal on Escape
  useEffect(() => {
    if (!modal) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal(false)
      if (e.key === 'Enter') closeModal(modal.type === 'alert' ? true : true)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [modal])

  const confirmLabel = lang === 'pt' ? 'Confirmar' : 'Confirm'
  const cancelLabel = lang === 'pt' ? 'Cancelar' : 'Cancel'

  return (
    <AppContext.Provider value={{ theme, setTheme, toggleTheme, lang, setLang, t, showAlert, showConfirm, showToast }}>
      {children}
      {modal && (
        <div className="modal-overlay" onClick={() => closeModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-message">{modal.message}</div>
            <div className="modal-actions">
              {modal.type === 'confirm' ? (
                <>
                  <button className="modal-btn modal-btn--cancel" onClick={() => closeModal(false)}>{cancelLabel}</button>
                  <button className={`modal-btn ${modal.danger ? 'modal-btn--danger' : 'modal-btn--confirm'}`} onClick={() => closeModal(true)}>{confirmLabel}</button>
                </>
              ) : (
                <button className="modal-btn modal-btn--ok" onClick={() => closeModal(true)}>OK</button>
              )}
            </div>
          </div>
        </div>
      )}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map(toast => (
            <div key={toast.id} className={`toast toast--${toast.type}`} style={{ '--toast-duration': '2.7s' } as React.CSSProperties}>
              <span className="toast-icon">{toast.type === 'success' ? '✓' : toast.type === 'error' ? '✗' : 'ℹ'}</span>
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
