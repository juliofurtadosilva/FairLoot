import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { bnetLogin } from '../services/auth'
import { useApp } from '../context/AppContext'

export default function BnetCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { lang } = useApp()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state') || 'register-us'

    if (!code) {
      setError(lang === 'pt' ? 'Código de autorização não encontrado.' : 'Authorization code not found.')
      return
    }

    const parts = state.split('-')
    const flow = parts[0] // 'login' or 'register'
    const region = parts.slice(1).join('-') || 'us'
    const redirectUri = window.location.origin + '/bnet-callback'

    if (flow === 'login') {
      // Login flow — authenticate directly
      bnetLogin({ code, redirectUri, region })
        .then(res => {
          if (res?.token) {
            navigate('/control', { replace: true })
          } else if (res?.message) {
            // Pending approval
            sessionStorage.setItem('bnet_pending', res.message)
            navigate('/?pending=1', { replace: true })
          } else if (res?.sessionId && res?.accounts) {
            // Multiple accounts — show selection
            sessionStorage.setItem('bnet_login_select', JSON.stringify({
              sessionId: res.sessionId,
              accounts: res.accounts,
            }))
            navigate('/?bnet-login=1', { replace: true })
          }
        })
        .catch(err => {
          const msg = err?.response?.data || (lang === 'pt' ? 'Erro ao fazer login' : 'Login error')
          setError(String(msg))
        })
    } else {
      // Register flow — fetch characters
      api.post('/api/auth/bnet/characters', { code, redirectUri, region })
        .then(r => {
          sessionStorage.setItem('bnet_session', JSON.stringify({
            sessionId: r.data.sessionId,
            characters: r.data.characters,
            battleTag: r.data.battleTag,
            registeredGuilds: r.data.registeredGuilds || [],
            region,
          }))
          navigate('/?bnet=1', { replace: true })
        })
        .catch(err => {
          const msg = err?.response?.data || (lang === 'pt' ? 'Erro ao conectar com Battle.net' : 'Error connecting to Battle.net')
          setError(String(msg))
        })
    }
  }, [])

  if (error) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16, color: 'var(--text)',
      }}>
        <div style={{ fontSize: 18, color: '#ef4444' }}>⚠️ {error}</div>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer',
          }}
        >
          {lang === 'pt' ? 'Voltar' : 'Go back'}
        </button>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
        <div>{lang === 'pt' ? 'Conectando com Battle.net...' : 'Connecting to Battle.net...'}</div>
      </div>
    </div>
  )
}
