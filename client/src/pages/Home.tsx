import React, { useState, useEffect, useRef } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { login, register, bnetRegister, bnetLogin, bnetLoginSelect } from '../services/auth'
import { enterDemoMode, isDemoMode } from '../services/demoData'
import api from '../services/api'
import goldOneImg from '../assets/gold_one.png'
import goldTwoImg from '../assets/gold_two.png'
import logoImg from '../assets/logo.png'
import miniLogoImg from '../assets/mini_logo.png'
import './Home.scss'

type View = 'home' | 'login' | 'register' | 'bnet-register' | 'bnet-login-select' | 'pending'

type BnetChar = {
  name: string
  realmSlug: string
  realmName: string
  level: number
  className?: string
  raceName?: string
  faction?: string
  guildName?: string
  guildRealmSlug?: string
  guildRealmName?: string
  guildRank?: number | null
}

type BnetAccount = {
  userId: string
  characterName?: string
  guildName?: string
  guildServer?: string
  role: string
  isApproved: boolean
}

export default function Home() {
  const token = localStorage.getItem('accessToken')
  if (token) return <Navigate to="/control" replace />

  const { t, theme, setTheme, lang, setLang } = useApp()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [view, setView] = useState<View>('home')

  // login state
  const [loginRegion, setLoginRegion] = useState('us')
  const [loginError, setLoginError] = useState<string | null>(null)

  // register state (Battle.net flow)
  const [regRegion, setRegRegion] = useState('us')
  const [bnetSessionId, setBnetSessionId] = useState('')
  const [bnetCharacters, setBnetCharacters] = useState<BnetChar[]>([])
  const [bnetBattleTag, setBnetBattleTag] = useState('')
  const [registeredGuilds, setRegisteredGuilds] = useState<{ guildName: string, guildServer: string }[]>([])
  const [selectedCharIdx, setSelectedCharIdx] = useState<number | null>(null)
  const [regWowauditKey, setRegWowauditKey] = useState('')
  const [regError, setRegError] = useState<string | null>(null)
  const [regLoading, setRegLoading] = useState(false)

  // login select state (multiple accounts)
  const [loginSelectSessionId, setLoginSelectSessionId] = useState('')
  const [loginAccounts, setLoginAccounts] = useState<BnetAccount[]>([])
  const [loginSelectLoading, setLoginSelectLoading] = useState(false)
  const [loginSelectError, setLoginSelectError] = useState<string | null>(null)

  // Check if guild already exists in FairLoot
  const [guildExistsInFairloot, setGuildExistsInFairloot] = useState(false)
  const [checkingGuild, setCheckingGuild] = useState(false)

  // Check for Battle.net callback data on mount
  useEffect(() => {
    // Check for pending approval from login
    const pendingMsg = sessionStorage.getItem('bnet_pending')
    if (pendingMsg) {
      sessionStorage.removeItem('bnet_pending')
      setPendingGuildName('')
      setView('pending')
      return
    }
    // Check for login multi-account selection
    const loginSelect = sessionStorage.getItem('bnet_login_select')
    if (loginSelect) {
      try {
        const data = JSON.parse(loginSelect)
        setLoginSelectSessionId(data.sessionId)
        setLoginAccounts(data.accounts || [])
        setView('bnet-login-select')
        sessionStorage.removeItem('bnet_login_select')
      } catch { /* ignore */ }
      return
    }
    // Check for register session
    const stored = sessionStorage.getItem('bnet_session')
    if (stored) {
      try {
        const data = JSON.parse(stored)
        setBnetSessionId(data.sessionId)
        setBnetCharacters(data.characters || [])
        setBnetBattleTag(data.battleTag || '')
        setRegisteredGuilds(data.registeredGuilds || [])
        setRegRegion(data.region || 'us')
        setView('bnet-register')
        sessionStorage.removeItem('bnet_session')
      } catch { /* ignore */ }
    }
  }, [searchParams])

  // When a character is selected, check if their guild exists in FairLoot
  useEffect(() => {
    if (selectedCharIdx === null) { setGuildExistsInFairloot(false); return }
    const char = bnetCharacters[selectedCharIdx]
    if (!char?.guildName || !char?.guildRealmName) { setGuildExistsInFairloot(false); return }
    setCheckingGuild(true)
    api.get('/api/auth/check-guild', { params: { name: char.guildName, server: char.guildRealmName } })
      .then(r => setGuildExistsInFairloot(r.data?.exists === true))
      .catch(() => setGuildExistsInFairloot(false))
      .finally(() => setCheckingGuild(false))
  }, [selectedCharIdx])

  const handleLoginBnet = async () => {
    setLoginError(null)
    try {
      const redirectUri = window.location.origin + '/bnet-callback'
      const r = await api.get('/api/auth/bnet/url', { params: { region: loginRegion, redirectUri } })
      if (r.data?.url) {
        // Use state to tell BnetCallback this is a login flow
        const url = new URL(r.data.url)
        url.searchParams.set('state', `login-${loginRegion}`)
        window.location.href = url.toString()
      } else {
        setLoginError(lang === 'pt' ? 'Blizzard API não configurada.' : 'Blizzard API not configured.')
      }
    } catch (err: any) {
      setLoginError(err?.response?.data || 'Error')
    }
  }

  const handleConnectBnet = async () => {
    setRegError(null)
    try {
      const redirectUri = window.location.origin + '/bnet-callback'
      const r = await api.get('/api/auth/bnet/url', { params: { region: regRegion, redirectUri } })
      if (r.data?.url) {
        const url = new URL(r.data.url)
        url.searchParams.set('state', `register-${regRegion}`)
        window.location.href = url.toString()
      } else {
        setRegError(lang === 'pt' ? 'Blizzard API não configurada.' : 'Blizzard API not configured.')
      }
    } catch (err: any) {
      setRegError(err?.response?.data || 'Error')
    }
  }

  const handleBnetRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedCharIdx === null) return
    setRegError(null)
    setRegLoading(true)
    try {
      const res = await bnetRegister({
        sessionId: bnetSessionId,
        characterIndex: selectedCharIdx,
        wowauditApiKey: regWowauditKey || undefined,
      })
      if (res?.token) {
        navigate('/control')
      } else if (res?.message) {
        // Pending approval — show dedicated screen
        setPendingGuildName(selectedChar?.guildName || '')
        setView('pending')
      }
    } catch (err: any) {
      setRegError(err?.response?.data || 'Erro no registro')
    } finally {
      setRegLoading(false)
    }
  }

  const selectedChar = selectedCharIdx !== null ? bnetCharacters[selectedCharIdx] : null

  const rankLabel = (rank: number | null | undefined) => {
    if (rank === null || rank === undefined) return null
    if (rank === 0) return { text: 'Guild Master', color: '#facc15', badge: '👑' }
    if (rank === 1) return { text: lang === 'pt' ? 'Oficial' : 'Officer', color: '#22c55e', badge: '⭐' }
    return { text: `Rank ${rank}`, color: 'var(--muted)', badge: '' }
  }

  // Pending approval state
  const [pendingGuildName, setPendingGuildName] = useState('')

  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box' }

  return (
    <div className="home-page">
      {/* Top-right controls */}
      <div className="home-controls">
        <div className="theme-picker">
          <button className={`theme-btn${theme === 'dark' ? ' active' : ''}`} onClick={() => setTheme('dark')} title="Dark">Dark</button>
          <button className={`theme-btn${theme === 'light' ? ' active' : ''}`} onClick={() => setTheme('light')} title="Light">Light</button>
          <button className={`theme-btn${theme === 'classic' ? ' active' : ''}`} onClick={() => setTheme('classic')} title="WoW Classic">WoW</button>
        </div>
        <button onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')} className="home-lang-btn">
          {lang === 'pt' ? 'EN' : 'PT'}
        </button>
      </div>

      {/* Left image */}
      <div className="home-lateral home-lateral-left" style={{ backgroundImage: `url(${goldOneImg})` }} />

      {/* Center card */}
      <div className={`home-card home-card--${view} home-center-card`}>
        {/* Logo: large+absolute for home/login, small+inline for register */}
        <img src={logoImg} alt="FairLoot" className="home-card__logo" draggable={false} />

        {/* ── HOME view ── */}
        {view === 'home' && (
          <>
            <p className="home-hint">{t('home.subtitle')}</p>
            <div className="home-btn-group">
              <button onClick={() => setView('login')} className="home-btn-primary">{t('home.login')}</button>
              <button onClick={() => setView('register')} className="home-btn-secondary">{t('home.register')}</button>
              <button onClick={() => { enterDemoMode(); navigate('/control') }} className="home-btn-demo">
                🔍 {t('home.demo')}
              </button>
              <div className="home-demo-desc">{t('home.demoDesc')}</div>
            </div>
          </>
        )}

        {/* ── LOGIN view ── */}
        {view === 'login' && (
          <>
            <div className="home-hint">
              {lang === 'pt' ? 'Entre com sua conta Battle.net' : 'Sign in with your Battle.net account'}
            </div>
            <div className="home-region-row">
              <label className="home-region-label">{lang === 'pt' ? 'Região' : 'Region'}</label>
              <select value={loginRegion} onChange={e => setLoginRegion(e.target.value)} className="home-region-select">
                <option value="us">US / Latin America</option>
                <option value="eu">Europe</option>
                <option value="kr">Korea</option>
                <option value="tw">Taiwan</option>
              </select>
            </div>
            <button onClick={handleLoginBnet} className="home-btn-bnet">
              🎮 {lang === 'pt' ? 'Entrar com Battle.net' : 'Sign in with Battle.net'}
            </button>
            {loginError && <div className="home-error">{String(loginError)}</div>}
            <button onClick={() => { setView('home'); setLoginError(null) }} className="home-back-btn">← {t('loot.back')}</button>
          </>
        )}

        {/* ── REGISTER view (Step 1: Connect with Battle.net) ── */}
        {view === 'register' && (
          <>
            <div className="home-hint">
              {lang === 'pt' ? 'Conecte sua conta Battle.net para registrar' : 'Connect your Battle.net account to register'}
            </div>
            <div className="home-region-row">
              <label className="home-region-label">{lang === 'pt' ? 'Região' : 'Region'}</label>
              <select value={regRegion} onChange={e => setRegRegion(e.target.value)} className="home-region-select">
                <option value="us">US / Latin America</option>
                <option value="eu">Europe</option>
                <option value="kr">Korea</option>
                <option value="tw">Taiwan</option>
              </select>
            </div>
            <button onClick={handleConnectBnet} className="home-btn-bnet">
              🎮 {lang === 'pt' ? 'Conectar com Battle.net' : 'Connect with Battle.net'}
            </button>
            {regError && <div className="home-error">{String(regError)}</div>}
            <button onClick={() => { setView('home'); setRegError(null) }} className="home-back-btn">← {t('loot.back')}</button>
          </>
        )}

        {/* ── BNET-REGISTER view (Step 2: Select character + complete registration) ── */}
        {view === 'bnet-register' && (() => {
          const canCreate = selectedChar != null
            && selectedChar.guildRank !== null && selectedChar.guildRank !== undefined
            && selectedChar.guildRank <= 1
            && !guildExistsInFairloot
          return (
          <>
            {/* Logo absolute on the left side of the page */}
            <img src={miniLogoImg} alt="FairLoot" className="bnet-register-logo home-bnet-logo" draggable={false} />

            <div className="home-hint">
              {lang === 'pt' ? 'Selecione seu personagem' : 'Select your character'}
            </div>

            {/* Character list */}
            <div className="home-char-list">
              {bnetCharacters.filter(c => c.guildName).map((c, i) => {
                const rl = rankLabel(c.guildRank)
                const canCreate = c.guildRank !== null && c.guildRank !== undefined && c.guildRank <= 1
                const alreadyRegistered = registeredGuilds.some(
                  rg => rg.guildName === c.guildName && rg.guildServer === (c.guildRealmName || c.realmName)
                )
                return (
                <div key={`${c.realmSlug}-${c.name}`}
                  onClick={() => !alreadyRegistered && setSelectedCharIdx(i)}
                  className={`home-char-item ${selectedCharIdx === i ? 'home-char-item--selected' : 'home-char-item--default'} ${alreadyRegistered ? 'home-char-item--disabled' : ''}`}
                  style={{ cursor: alreadyRegistered ? 'not-allowed' : 'pointer' }}
                >
                  <div>
                    <strong>{c.name}</strong>
                    <span className="home-char-detail">{c.realmName}</span>
                    <span className="home-char-detail-sm">Lv{c.level}</span>
                    {c.className && <span className="home-char-detail-sm">{c.className}</span>}
                  </div>
                  <div className="home-char-right">
                    <span className="home-char-guild">⚔️ {c.guildName}</span>
                    {alreadyRegistered ? (
                      <span className="home-char-registered">
                        {lang === 'pt' ? '✓ já registrado' : '✓ already registered'}
                      </span>
                    ) : rl && (
                      <span className="home-char-rank" style={{ color: rl.color }}>
                        {rl.badge} {rl.text} {canCreate ? (lang === 'pt' ? '— pode criar' : '— can create') : ''}
                      </span>
                    )}
                  </div>
                </div>
                )
              })}
              {bnetCharacters.filter(c => c.guildName).length === 0 && (
                <div className="home-no-chars">
                  {lang === 'pt' ? 'Nenhum personagem com guild encontrado.' : 'No characters with a guild found.'}
                </div>
              )}
            </div>

            {/* Selected character guild info */}
            {selectedChar && selectedChar.guildName && (
              <div className="home-guild-info">
                <div>⚔️ <strong>{selectedChar.guildName}</strong> — {selectedChar.guildRealmName || selectedChar.realmName}</div>
                {selectedChar.faction && <div className="home-guild-faction">{selectedChar.faction}</div>}
                {(() => {
                  const rl = rankLabel(selectedChar.guildRank)
                  return rl ? <div style={{ color: rl.color }}>{rl.badge} {rl.text}</div> : null
                })()}
                {checkingGuild && <div className="home-guild-checking">⏳ {lang === 'pt' ? 'Verificando...' : 'Checking...'}</div>}
                {!checkingGuild && guildExistsInFairloot && (
                  <div className="home-guild-exists">
                    ⚠️ {lang === 'pt'
                      ? 'Guild já existe no FairLoot. Sua conta será Reader, pendente de aprovação.'
                      : 'Guild already exists on FairLoot. Your account will be Reader, pending approval.'}
                  </div>
                )}
                {!checkingGuild && !guildExistsInFairloot && selectedChar.guildRank !== null && selectedChar.guildRank !== undefined && selectedChar.guildRank <= 1 && (
                  <div className="home-guild-new">
                    ✓ {lang === 'pt'
                      ? 'Guild nova! Você será Admin.'
                      : 'New guild! You\'ll be Admin.'}
                  </div>
                )}
                {!checkingGuild && !guildExistsInFairloot && selectedChar.guildRank !== null && selectedChar.guildRank !== undefined && selectedChar.guildRank > 1 && (
                  <div className="home-guild-denied">
                    ✗ {lang === 'pt'
                      ? 'Você não é GM nem Oficial. Apenas rank 0-1 podem criar a guild.'
                      : 'You are not GM or Officer. Only rank 0-1 can create the guild.'}
                  </div>
                )}
              </div>
            )}

            {/* Registration form */}
            {selectedChar && (
              <form onSubmit={handleBnetRegister} className="home-reg-form">
                {bnetBattleTag && (
                  <div className="home-battletag">🏷️ {bnetBattleTag}</div>
                )}
                {canCreate && (
                  <div className="home-field">
                    <label className="home-field-label">WowAudit API Key ({lang === 'pt' ? 'opcional' : 'optional'})</label>
                    <input value={regWowauditKey} onChange={e => setRegWowauditKey(e.target.value)} className="home-field-input" style={inputStyle} />
                  </div>
                )}
                <button type="submit" disabled={regLoading} className="home-btn-submit" style={{ opacity: regLoading ? 0.6 : 1 }}>
                  {regLoading ? '⏳' : t('home.register')}
                </button>
              </form>
            )}

            {regError && <div className="home-error">{String(regError)}</div>}
            <button onClick={() => { setView('home'); setRegError(null); setBnetCharacters([]); setSelectedCharIdx(null) }} className="home-back-btn">← {t('loot.back')}</button>
          </>
          )
        })()}

        {/* ── BNET-LOGIN-SELECT view (multiple accounts) ── */}
        {view === 'bnet-login-select' && (
          <>
            <div className="home-hint">
              {lang === 'pt' ? 'Selecione em qual guild entrar' : 'Select which guild to enter'}
            </div>

            <div className="home-account-list">
              {loginAccounts.map(acc => (
                <div key={acc.userId}
                  onClick={async () => {
                    if (!acc.isApproved) return
                    setLoginSelectLoading(true)
                    setLoginSelectError(null)
                    try {
                      const res = await bnetLoginSelect({ sessionId: loginSelectSessionId, userId: acc.userId })
                      if (res?.token) navigate('/control')
                      else if (res?.message) {
                        setPendingGuildName(acc.guildName || '')
                        setView('pending')
                      }
                    } catch (err: any) {
                      setLoginSelectError(err?.response?.data || 'Error')
                    } finally {
                      setLoginSelectLoading(false)
                    }
                  }}
                  className={`home-account-item ${!acc.isApproved ? 'home-account-item--disabled' : ''}`}
                  style={{ cursor: acc.isApproved ? 'pointer' : 'not-allowed' }}
                >
                  <div>
                    <strong>{acc.characterName || '?'}</strong>
                    <span className="home-account-role">
                      {acc.role === 'Admin' ? '🛡️' : '👤'} {acc.role}
                    </span>
                  </div>
                  <div className="home-account-info">
                    <div>⚔️ {acc.guildName}</div>
                    <div>{acc.guildServer}</div>
                    {!acc.isApproved && (
                      <div className="home-account-pending">
                        ⏳ {lang === 'pt' ? 'Pendente' : 'Pending'}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {loginSelectLoading && <div className="home-loading">⏳</div>}
            {loginSelectError && <div className="home-error">{String(loginSelectError)}</div>}
            <button onClick={() => { setView('home'); setLoginSelectError(null) }} className="home-back-btn">← {t('loot.back')}</button>
          </>
        )}

        {/* ── PENDING view (waiting for admin approval) ── */}
        {view === 'pending' && (
          <>
            <div className="home-pending-icon">⏳</div>
            <div className="home-pending-title">
              {lang === 'pt' ? 'Conta criada com sucesso!' : 'Account created successfully!'}
            </div>
            <div className="home-pending-box">
              {lang === 'pt'
                ? `Sua conta foi criada como Reader na guild "${pendingGuildName}". Você precisa aguardar a aprovação do Admin da guild para acessar o sistema.`
                : `Your account was created as Reader in "${pendingGuildName}". You need to wait for the guild Admin to approve your access.`}
            </div>
            <div className="home-pending-hint">
              {lang === 'pt'
                ? 'Peça ao GM ou Admin da sua guild para aprovar sua conta na aba Membros do FairLoot.'
                : 'Ask your guild GM or Admin to approve your account in the Members tab on FairLoot.'}
            </div>
            <button onClick={() => { setView('login'); setRegError(null) }} className="home-btn-primary">
              {lang === 'pt' ? 'Ir para Login' : 'Go to Login'}
            </button>
            <button onClick={() => { setView('home') }} className="home-back-btn">← {t('loot.back')}</button>
          </>
        )}
      </div>

      {/* Right image */}
      <div className="home-lateral home-lateral-right" style={{ backgroundImage: `url(${goldTwoImg})` }} />
    </div>
  )
}
