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

  const { t, theme, toggleTheme, lang, setLang } = useApp()
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
  const labelStyle: React.CSSProperties = { fontSize: 13, color: 'var(--muted)' }
  const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
  const primaryBtn: React.CSSProperties = {
    width: '100%', padding: '10px 0', fontSize: 15, fontWeight: 600, borderRadius: 8,
    border: '1px solid rgba(var(--accent-rgb),0.4)', background: 'rgba(var(--accent-rgb),0.14)',
    color: 'var(--text)', cursor: 'pointer',
  }
  const secondaryBtn: React.CSSProperties = {
    width: '100%', padding: '10px 0', fontSize: 15, fontWeight: 600, borderRadius: 8,
    border: '1px solid var(--border)', background: 'transparent',
    color: 'var(--text)', cursor: 'pointer',
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 0,
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Top-right controls */}
      <div style={{
        position: 'absolute',
        top: 16,
        right: 24,
        display: 'flex',
        gap: 8,
        zIndex: 10,
      }}>
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          style={{
            fontSize: 16, padding: '6px 10px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', cursor: 'pointer',
          }}
        >{theme === 'dark' ? '☀️' : '🌙'}</button>
        <button
          onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}
          style={{
            fontSize: 12, padding: '6px 10px', fontWeight: 700, borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', cursor: 'pointer',
          }}
        >{lang === 'pt' ? 'EN' : 'PT'}</button>
      </div>

      {/* Left image */}
      <div style={{
        flex: '0 0 280px',
        height: 420,
        borderRadius: '16px 0 0 16px',
        background: `url(${goldOneImg}) center/cover no-repeat`,
      }} className="home-lateral" />

      {/* Center card */}
      <div className={`home-card home-card--${view}`} style={{
        background: 'linear-gradient(180deg, var(--surface), var(--surface-end))',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        zIndex: 2,
        position: 'relative',
      }}>
        {/* Logo: large+absolute for home/login, small+inline for register */}
        <img src={logoImg} alt="FairLoot" className="home-card__logo" draggable={false} />

        {/* ── HOME view ── */}
        {view === 'home' && (
          <>
            <p style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center', margin: 0, lineHeight: 1.5 }}>{t('home.subtitle')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 8 }}>
              <button onClick={() => setView('login')} style={primaryBtn}>{t('home.login')}</button>
              <button onClick={() => setView('register')} style={secondaryBtn}>{t('home.register')}</button>
              <button onClick={() => { enterDemoMode(); navigate('/control') }} style={{
                ...secondaryBtn,
                borderColor: 'rgba(250,204,21,0.35)',
                color: '#facc15',
                fontSize: 13,
              }}>
                🔍 {t('home.demo')}
              </button>
              <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>{t('home.demoDesc')}</div>
            </div>
          </>
        )}

        {/* ── LOGIN view ── */}
        {view === 'login' && (
          <>
            <div style={{ fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>
              {lang === 'pt' ? 'Entre com sua conta Battle.net' : 'Sign in with your Battle.net account'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <label style={{ ...labelStyle, whiteSpace: 'nowrap' }}>{lang === 'pt' ? 'Região' : 'Region'}</label>
              <select value={loginRegion} onChange={e => setLoginRegion(e.target.value)} style={{ ...inputStyle, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
                <option value="us">US / Latin America</option>
                <option value="eu">Europe</option>
                <option value="kr">Korea</option>
                <option value="tw">Taiwan</option>
              </select>
            </div>
            <button onClick={handleLoginBnet} style={{
              ...primaryBtn,
              background: 'linear-gradient(135deg, #006aff 0%, #0050cc 100%)',
              border: '1px solid #006aff',
              color: '#fff',
            }}>
              🎮 {lang === 'pt' ? 'Entrar com Battle.net' : 'Sign in with Battle.net'}
            </button>
            {loginError && <div style={{ color: '#ef4444', fontSize: 13, textAlign: 'center' }}>{String(loginError)}</div>}
            <button onClick={() => { setView('home'); setLoginError(null) }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}>← {t('loot.back')}</button>
          </>
        )}

        {/* ── REGISTER view (Step 1: Connect with Battle.net) ── */}
        {view === 'register' && (
          <>
            <div style={{ fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>
              {lang === 'pt' ? 'Conecte sua conta Battle.net para registrar' : 'Connect your Battle.net account to register'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <label style={{ ...labelStyle, whiteSpace: 'nowrap' }}>{lang === 'pt' ? 'Região' : 'Region'}</label>
              <select value={regRegion} onChange={e => setRegRegion(e.target.value)} style={{ ...inputStyle, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
                <option value="us">US / Latin America</option>
                <option value="eu">Europe</option>
                <option value="kr">Korea</option>
                <option value="tw">Taiwan</option>
              </select>
            </div>
            <button onClick={handleConnectBnet} style={{
              ...primaryBtn,
              background: 'linear-gradient(135deg, #006aff 0%, #0050cc 100%)',
              border: '1px solid #006aff',
              color: '#fff',
            }}>
              🎮 {lang === 'pt' ? 'Conectar com Battle.net' : 'Connect with Battle.net'}
            </button>
            {regError && <div style={{ color: '#ef4444', fontSize: 13, textAlign: 'center' }}>{String(regError)}</div>}
            <button onClick={() => { setView('home'); setRegError(null) }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}>← {t('loot.back')}</button>
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
            <img src={miniLogoImg} alt="FairLoot" style={{
              position: 'fixed', top: '6%', transform: 'translateY(-50%)',
              width: 120, objectFit: 'contain', zIndex: 20, pointerEvents: 'none',
            }} draggable={false} className="bnet-register-logo" />

            <div style={{ fontSize: 14, color: 'var(--muted)' }}>
              {lang === 'pt' ? 'Selecione seu personagem' : 'Select your character'}
            </div>

            {/* Character list */}
            <div style={{
              width: '100%', flex: 1, overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              {bnetCharacters.filter(c => c.guildName).map((c, i) => {
                const rl = rankLabel(c.guildRank)
                const canCreate = c.guildRank !== null && c.guildRank !== undefined && c.guildRank <= 1
                const alreadyRegistered = registeredGuilds.some(
                  rg => rg.guildName === c.guildName && rg.guildServer === (c.guildRealmName || c.realmName)
                )
                return (
                <div key={`${c.realmSlug}-${c.name}`}
                  onClick={() => !alreadyRegistered && setSelectedCharIdx(i)}
                  style={{
                    padding: '8px 10px', borderRadius: 6,
                    cursor: alreadyRegistered ? 'not-allowed' : 'pointer',
                    opacity: alreadyRegistered ? 0.4 : 1,
                    border: selectedCharIdx === i ? '1px solid rgba(var(--accent-rgb),0.6)' : '1px solid var(--border)',
                    background: selectedCharIdx === i ? 'rgba(var(--accent-rgb),0.1)' : 'transparent',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontSize: 13,
                  }}>
                  <div>
                    <strong>{c.name}</strong>
                    <span style={{ color: 'var(--muted)', marginLeft: 6 }}>{c.realmName}</span>
                    <span style={{ color: 'var(--muted)', marginLeft: 4 }}>Lv{c.level}</span>
                    {c.className && <span style={{ color: 'var(--muted)', marginLeft: 4 }}>{c.className}</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>⚔️ {c.guildName}</span>
                    {alreadyRegistered ? (
                      <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>
                        {lang === 'pt' ? '✓ já registrado' : '✓ already registered'}
                      </span>
                    ) : rl && (
                      <span style={{ fontSize: 10, color: rl.color, fontWeight: 600 }}>
                        {rl.badge} {rl.text} {canCreate ? (lang === 'pt' ? '— pode criar' : '— can create') : ''}
                      </span>
                    )}
                  </div>
                </div>
                )
              })}
              {bnetCharacters.filter(c => c.guildName).length === 0 && (
                <div style={{ color: '#ef4444', fontSize: 13, textAlign: 'center', padding: 12 }}>
                  {lang === 'pt' ? 'Nenhum personagem com guild encontrado.' : 'No characters with a guild found.'}
                </div>
              )}
            </div>

            {/* Selected character guild info */}
            {selectedChar && selectedChar.guildName && (
              <div style={{
                width: '100%', padding: '8px 10px', borderRadius: 6,
                background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid var(--border)',
                fontSize: 12, lineHeight: 1.5,
              }}>
                <div>⚔️ <strong>{selectedChar.guildName}</strong> — {selectedChar.guildRealmName || selectedChar.realmName}</div>
                {selectedChar.faction && <div style={{ color: 'var(--muted)' }}>{selectedChar.faction}</div>}
                {(() => {
                  const rl = rankLabel(selectedChar.guildRank)
                  return rl ? <div style={{ color: rl.color }}>{rl.badge} {rl.text}</div> : null
                })()}
                {checkingGuild && <div style={{ color: 'var(--muted)' }}>⏳ {lang === 'pt' ? 'Verificando...' : 'Checking...'}</div>}
                {!checkingGuild && guildExistsInFairloot && (
                  <div style={{ color: '#facc15', marginTop: 4 }}>
                    ⚠️ {lang === 'pt'
                      ? 'Guild já existe no FairLoot. Sua conta será Reader, pendente de aprovação.'
                      : 'Guild already exists on FairLoot. Your account will be Reader, pending approval.'}
                  </div>
                )}
                {!checkingGuild && !guildExistsInFairloot && selectedChar.guildRank !== null && selectedChar.guildRank !== undefined && selectedChar.guildRank <= 1 && (
                  <div style={{ color: '#22c55e', marginTop: 4 }}>
                    ✓ {lang === 'pt'
                      ? 'Guild nova! Você será Admin.'
                      : 'New guild! You\'ll be Admin.'}
                  </div>
                )}
                {!checkingGuild && !guildExistsInFairloot && selectedChar.guildRank !== null && selectedChar.guildRank !== undefined && selectedChar.guildRank > 1 && (
                  <div style={{ color: '#ef4444', marginTop: 4 }}>
                    ✗ {lang === 'pt'
                      ? 'Você não é GM nem Oficial. Apenas rank 0-1 podem criar a guild.'
                      : 'You are not GM or Officer. Only rank 0-1 can create the guild.'}
                  </div>
                )}
              </div>
            )}

            {/* Registration form */}
            {selectedChar && (
              <form onSubmit={handleBnetRegister} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                {bnetBattleTag && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                    🏷️ {bnetBattleTag}
                  </div>
                )}
                {canCreate && (
                  <div style={fieldStyle}>
                    <label style={labelStyle}>WowAudit API Key ({lang === 'pt' ? 'opcional' : 'optional'})</label>
                    <input value={regWowauditKey} onChange={e => setRegWowauditKey(e.target.value)} style={inputStyle} />
                  </div>
                )}
                <button type="submit" disabled={regLoading} style={{ ...primaryBtn, marginTop: 4, opacity: regLoading ? 0.6 : 1 }}>
                  {regLoading ? '⏳' : t('home.register')}
                </button>
              </form>
            )}

            {regError && <div style={{ color: '#ef4444', fontSize: 13, textAlign: 'center' }}>{String(regError)}</div>}
            <button onClick={() => { setView('home'); setRegError(null); setBnetCharacters([]); setSelectedCharIdx(null) }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}>← {t('loot.back')}</button>
          </>
          )
        })()}

        {/* ── BNET-LOGIN-SELECT view (multiple accounts) ── */}
        {view === 'bnet-login-select' && (
          <>
            <div style={{ fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>
              {lang === 'pt' ? 'Selecione em qual guild entrar' : 'Select which guild to enter'}
            </div>

            <div style={{
              width: '100%', maxHeight: 240, overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
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
                  style={{
                    padding: '12px 14px', borderRadius: 8, cursor: acc.isApproved ? 'pointer' : 'not-allowed',
                    opacity: acc.isApproved ? 1 : 0.45,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontSize: 13,
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => acc.isApproved && (e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb),0.5)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <div>
                    <strong>{acc.characterName || '?'}</strong>
                    <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 12 }}>
                      {acc.role === 'Admin' ? '🛡️' : '👤'} {acc.role}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>
                    <div>⚔️ {acc.guildName}</div>
                    <div>{acc.guildServer}</div>
                    {!acc.isApproved && (
                      <div style={{ color: '#facc15', fontWeight: 600, marginTop: 2 }}>
                        ⏳ {lang === 'pt' ? 'Pendente' : 'Pending'}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {loginSelectLoading && <div style={{ color: 'var(--muted)', fontSize: 13 }}>⏳</div>}
            {loginSelectError && <div style={{ color: '#ef4444', fontSize: 13, textAlign: 'center' }}>{String(loginSelectError)}</div>}
            <button onClick={() => { setView('home'); setLoginSelectError(null) }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}>← {t('loot.back')}</button>
          </>
        )}

        {/* ── PENDING view (waiting for admin approval) ── */}
        {view === 'pending' && (
          <>
            <div style={{ fontSize: 48, textAlign: 'center' }}>⏳</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', textAlign: 'center' }}>
              {lang === 'pt' ? 'Conta criada com sucesso!' : 'Account created successfully!'}
            </div>
            <div style={{
              width: '100%', padding: '12px 14px', borderRadius: 8,
              background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.25)',
              fontSize: 13, color: '#facc15', textAlign: 'center', lineHeight: 1.6,
            }}>
              {lang === 'pt'
                ? `Sua conta foi criada como Reader na guild "${pendingGuildName}". Você precisa aguardar a aprovação do Admin da guild para acessar o sistema.`
                : `Your account was created as Reader in "${pendingGuildName}". You need to wait for the guild Admin to approve your access.`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
              {lang === 'pt'
                ? 'Peça ao GM ou Admin da sua guild para aprovar sua conta na aba Membros do FairLoot.'
                : 'Ask your guild GM or Admin to approve your account in the Members tab on FairLoot.'}
            </div>
            <button onClick={() => { setView('login'); setRegError(null) }} style={primaryBtn}>
              {lang === 'pt' ? 'Ir para Login' : 'Go to Login'}
            </button>
            <button onClick={() => { setView('home') }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}>← {t('loot.back')}</button>
          </>
        )}
      </div>

      {/* Right image */}
      <div style={{
        flex: '0 0 280px',
        height: 420,
        borderRadius: '0 16px 16px 0',
        background: `url(${goldTwoImg}) center/cover no-repeat`,
      }} className="home-lateral" />
    </div>
  )
}
