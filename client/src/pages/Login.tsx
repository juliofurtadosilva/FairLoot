import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { login } from '../services/auth'
import { useApp } from '../context/AppContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { t, theme, setTheme, lang, setLang } = useApp()

  const handle = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await login(email, password)
      if (res?.token) navigate('/control')
      else if (res?.message) setError(String(res.message))
    } catch (err: any) {
      setError(err?.response?.data || t('login.error'))
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
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
        <div className="theme-picker">
          <button className={`theme-btn${theme === 'dark' ? ' active' : ''}`} onClick={() => setTheme('dark')} title="Dark">Dark</button>
          <button className={`theme-btn${theme === 'light' ? ' active' : ''}`} onClick={() => setTheme('light')} title="Light">Light</button>
          <button className={`theme-btn${theme === 'classic' ? ' active' : ''}`} onClick={() => setTheme('classic')} title="WoW Classic">WoW</button>
        </div>
        <button
          onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}
          style={{
            fontSize: 12,
            padding: '6px 10px',
            fontWeight: 700,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >{lang === 'pt' ? 'EN' : 'PT'}</button>
      </div>

      <div style={{
        width: 360,
        background: 'linear-gradient(180deg, var(--surface), var(--surface-end))',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
        padding: '40px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)', marginBottom: 4 }}>FairLoot</div>
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>{t('login.title')}</div>
        </div>
        <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 13, color: 'var(--muted)' }}>{t('login.email')}</label>
            <input value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 13, color: 'var(--muted)' }}>{t('login.password')}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
          <button type="submit" style={{
            width: '100%',
            padding: '10px 0',
            fontSize: 15,
            fontWeight: 600,
            borderRadius: 8,
            border: '1px solid rgba(var(--accent-rgb),0.4)',
            background: 'rgba(var(--accent-rgb),0.14)',
            color: 'var(--text)',
            cursor: 'pointer',
            marginTop: 4,
          }}>{t('login.submit')}</button>
        </form>
        {error && <div style={{ color: '#ef4444', fontSize: 13, textAlign: 'center' }}>{String(error)}</div>}
        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
          <Link to="/" style={{ color: 'var(--accent)' }}>← {t('loot.back')}</Link>
        </div>
      </div>
    </div>
  )
}
