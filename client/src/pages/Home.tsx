import React, { useState, useEffect, useRef } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { login, register } from '../services/auth'
import api from '../services/api'
import goldOneImg from '../assets/gold_one.png'
import goldTwoImg from '../assets/gold_two.png'
import logoImg from '../assets/logo.png'

type View = 'home' | 'login' | 'register'

export default function Home() {
  const token = localStorage.getItem('accessToken')
  if (token) return <Navigate to="/control" replace />

  const { t, theme, toggleTheme, lang, setLang } = useApp()
  const navigate = useNavigate()
  const [view, setView] = useState<View>('home')

  // login state
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)

  // register state
  const [regGuildName, setRegGuildName] = useState('')
  const [regServer, setRegServer] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regWowauditKey, setRegWowauditKey] = useState('')
  const [regError, setRegError] = useState<string | null>(null)
  const [guildExists, setGuildExists] = useState(false)
  const [checkingGuild, setCheckingGuild] = useState(false)
  const guildCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // debounced guild existence check
  useEffect(() => {
    if (guildCheckTimer.current) clearTimeout(guildCheckTimer.current)
    const name = regGuildName.trim()
    const server = regServer.trim()
    if (!name || !server) { setGuildExists(false); return }
    setCheckingGuild(true)
    guildCheckTimer.current = setTimeout(async () => {
      try {
        const r = await api.get('/api/auth/check-guild', { params: { name, server } })
        const exists = r.data?.exists === true
        setGuildExists(exists)
        if (exists) setRegWowauditKey('')
      } catch { setGuildExists(false) }
      finally { setCheckingGuild(false) }
    }, 400)
    return () => { if (guildCheckTimer.current) clearTimeout(guildCheckTimer.current) }
  }, [regGuildName, regServer])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    try {
      const res = await login(loginEmail, loginPassword)
      if (res?.token) navigate('/control')
      else if (res?.message) setLoginError(String(res.message))
    } catch (err: any) {
      setLoginError(err?.response?.data || t('login.error'))
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegError(null)
    try {
      const res = await register(regGuildName, regServer, regEmail, regPassword, guildExists ? undefined : (regWowauditKey || undefined))
      if (res?.token) {
        navigate('/control')
      } else if (res?.message) {
        setRegError(String(res.message))
      } else {
        setView('login')
      }
    } catch (err: any) {
      setRegError(err?.response?.data || 'Erro no registro')
    }
  }

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
            </div>
          </>
        )}

        {/* ── LOGIN view ── */}
        {view === 'login' && (
          <>
            
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>{t('login.email')}</label>
                <input value={loginEmail} onChange={e => setLoginEmail(e.target.value)} style={inputStyle} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>{t('login.password')}</label>
                <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} style={inputStyle} />
              </div>
              <button type="submit" style={{ ...primaryBtn, marginTop: 4 }}>{t('login.submit')}</button>
            </form>
            {loginError && <div style={{ color: '#ef4444', fontSize: 13, textAlign: 'center' }}>{String(loginError)}</div>}
            <button onClick={() => { setView('home'); setLoginError(null) }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}>← {t('loot.back')}</button>
          </>
        )}

        {/* ── REGISTER view ── */}
        {view === 'register' && (
          <>
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>{t('home.register')}</div>
            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Guild Name</label>
                <input value={regGuildName} onChange={e => setRegGuildName(e.target.value)} style={inputStyle} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Server</label>
                <input value={regServer} onChange={e => setRegServer(e.target.value)} style={inputStyle} />
              </div>
              {guildExists && (
                <div style={{ fontSize: 12, color: '#facc15', background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.25)', borderRadius: 6, padding: '8px 10px', textAlign: 'center', lineHeight: 1.4 }}>
                  {lang === 'pt'
                    ? 'Essa guilda já existe. Sua conta será criada como Reader e ficará pendente de aprovação pelo Admin.'
                    : 'This guild already exists. Your account will be created as Reader and pending approval by the Admin.'}
                </div>
              )}
              <div style={fieldStyle}>
                <label style={labelStyle}>Email</label>
                <input value={regEmail} onChange={e => setRegEmail(e.target.value)} style={inputStyle} />
              </div>
              {!guildExists && (
                <div style={fieldStyle}>
                  <label style={labelStyle}>WowAudit API Key ({lang === 'pt' ? 'opcional' : 'optional'})</label>
                  <input value={regWowauditKey} onChange={e => setRegWowauditKey(e.target.value)} style={inputStyle} />
                </div>
              )}
              <div style={fieldStyle}>
                <label style={labelStyle}>{t('login.password')}</label>
                <input type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} style={inputStyle} />
              </div>
              <button type="submit" style={{ ...primaryBtn, marginTop: 4 }}>{t('home.register')}</button>
            </form>
            {regError && <div style={{ color: '#ef4444', fontSize: 13, textAlign: 'center' }}>{String(regError)}</div>}
            <button onClick={() => { setView('home'); setRegError(null) }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}>← {t('loot.back')}</button>
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
