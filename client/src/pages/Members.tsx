import React, { useEffect, useState } from 'react'
import api from '../services/api'
import { useApp } from '../context/AppContext'
import { isDemoMode, getDemoCharacters } from '../services/demoData'

export default function Members() {
  const [members, setMembers] = useState<any[]>([])
  const [pending, setPending] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const { t } = useApp()

  const fetchMembers = async () => {
    try {
      const r = await api.get('/api/guildmember')
      setMembers(r.data || [])
    } catch (err: any) {
      setError(err?.response?.data || t('members.errorFetch'))
    }
  }

  const fetchPending = async () => {
    try {
      const r = await api.get('/api/guild/members/pending')
      setPending(r.data || [])
    } catch {
      // ignore if not admin
    }
  }

  useEffect(() => {
    const init = async () => {
      if (isDemoMode()) {
        setIsAdmin(true)
        const chars = getDemoCharacters()
        setMembers(chars.map((c: any, i: number) => ({
          id: c.blizzard_id || `demo-${i}`,
          characterName: c.name,
          battleTag: '',
          email: '',
          role: i === 0 ? 'Admin' : 'Reader',
        })))
        setPending([])
        return
      }
      try {
        const me = await api.get('/api/auth/me')
        setIsAdmin(me.data?.role === 'Admin')
      } catch {}
      fetchMembers()
      fetchPending()
    }
    init()
  }, [])

  const approve = async (id: string) => {
    if (isDemoMode()) return
    try {
      await api.post(`/api/guild/members/${id}/approve`)
      await Promise.all([fetchPending(), fetchMembers()])
    } catch (err: any) {
      setError(err?.response?.data || t('members.errorApprove'))
    }
  }

  const removeMember = async (id: string) => {
    if (isDemoMode()) return
    if (!confirm(t('members.confirmRemove'))) return
    try {
      await api.delete(`/api/guildmember/${id}`)
      await Promise.all([fetchMembers(), fetchPending()])
    } catch (err: any) {
      setError(err?.response?.data || t('members.errorRemove'))
    }
  }

  const roleColor = (role: string) => {
    if (role === 'Admin') return 'var(--color-mythic)'
    return 'var(--muted)'
  }

  return (
    <div className="tab-content">
      <div className="card tab-card" style={{ gap: 20 }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>{t('members.title')}</h3>
        {error && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}

        {/* Active members */}
        <div style={{ width: '100%' }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 15 }}>{t('members.active')}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {members.map(m => {
              const displayName = m.characterName || m.battleTag || m.email || '?'
              const initial = displayName[0]?.toUpperCase() || '?'
              return (
              <div key={m.id} className="card" style={{
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: m.role === 'Admin' ? 'rgba(255,128,0,0.12)' : 'rgba(var(--accent-rgb),0.10)',
                  border: `2px solid ${roleColor(m.role)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, color: roleColor(m.role), flexShrink: 0,
                }}>{initial}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
                  {m.battleTag && m.characterName && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.battleTag}</div>
                  )}
                  <div style={{ fontSize: 11, color: roleColor(m.role), fontWeight: 600 }}>{m.role}</div>
                </div>
                {isAdmin && m.role !== 'Admin' && (
                  <button
                    onClick={() => removeMember(m.id)}
                    title={t('members.remove')}
                    style={{
                      background: 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.3)',
                      color: '#ef4444',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >✕</button>
                )}
              </div>
              )
            })}
          </div>
        </div>

        {/* Pending members — admin only */}
        {isAdmin && (
          <div style={{ width: '100%' }}>
            <h4 style={{ margin: '0 0 10px', fontSize: 15 }}>{t('members.pending')}</h4>
            {pending.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{t('members.noPending')}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {pending.map(p => {
                const displayName = p.characterName || p.battleTag || p.email || '?'
                const initial = displayName[0]?.toUpperCase() || '?'
                return (
                <div key={p.id} className="card" style={{
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  borderColor: 'rgba(250,204,21,0.25)',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'rgba(250,204,21,0.08)',
                    border: '2px solid rgba(250,204,21,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, color: '#facc15', flexShrink: 0,
                  }}>{initial}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
                    {p.battleTag && p.characterName && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.battleTag}</div>
                    )}
                    <div style={{ fontSize: 11, color: '#facc15', fontWeight: 600 }}>{t('members.pending')}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => approve(p.id)}
                      style={{
                        background: 'rgba(16,185,129,0.10)',
                        border: '1px solid rgba(16,185,129,0.35)',
                        color: '#10b981',
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >{t('members.approve')}</button>
                    <button
                      onClick={() => removeMember(p.id)}
                      title={t('members.remove')}
                      style={{
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        color: '#ef4444',
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >✕</button>
                  </div>
                </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
