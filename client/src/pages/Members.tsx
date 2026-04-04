import React, { useEffect, useState } from 'react'
import api from '../services/api'
import { useApp } from '../context/AppContext'
import { isDemoMode, getDemoCharacters } from '../services/demoData'
import { getClassIconUrl, getClassColor } from '../services/classIcons'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import './Members.scss'

export default function Members() {
  const [members, setMembers] = useState<any[]>([])
  const [pending, setPending] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [classMap, setClassMap] = useState<Record<string, string>>({})
  const { t, theme, showConfirm } = useApp()

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
        const cMap: Record<string, string> = {}
        chars.forEach((c: any) => { if (c.name && c.class) cMap[c.name.toLowerCase()] = c.class })
        setClassMap(cMap)
        setMembers(chars.map((c: any, i: number) => ({
          id: c.blizzard_id || `demo-${i}`,
          characterName: c.name,
          battleTag: '',
          email: '',
          role: i === 0 ? 'Admin' : 'Reader',
        })))
        setPending([])
        setInitialLoading(false)
        return
      }
      try {
        const me = await api.get('/api/auth/me')
        setIsAdmin(me.data?.role === 'Admin')
      } catch {}
      await Promise.all([fetchMembers(), fetchPending()])
      try {
        const c = await api.get('/api/guild/characters')
        const cMap: Record<string, string> = {}
        ;(c.data || []).forEach((ch: any) => { if (ch.name && ch.class) cMap[ch.name.toLowerCase()] = ch.class })
        setClassMap(cMap)
      } catch {}
      setInitialLoading(false)
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
    if (!(await showConfirm(t('members.confirmRemove'), true))) return
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
        <h3 className="members-title">{t('members.title')}</h3>
        {error && <div className="members-error">{error}</div>}

        {initialLoading ? (
          <div className="members-section">
            <Skeleton count={6} grid />
          </div>
        ) : (
          <>
        {/* Active members */}
        <div className="members-section">
          <h4 className="members-section-title">{t('members.active')}</h4>
          <div className="members-grid">
            {members.map(m => {
              const displayName = m.characterName || m.battleTag || m.email || '?'
              const initial = displayName[0]?.toUpperCase() || '?'
              const charClass = m.characterName ? classMap[m.characterName.toLowerCase()] : undefined
              const classIcon = getClassIconUrl(charClass)
              return (
              <div key={m.id} className="card member-card">
                {classIcon ? (
                  <img
                    src={classIcon}
                    alt={charClass}
                    className={`member-avatar member-avatar--icon ${m.role === 'Admin' ? 'member-avatar--admin' : 'member-avatar--reader'}`}
                    style={{ borderColor: getClassColor(charClass, theme) }}
                    draggable={false}
                  />
                ) : (
                  <div
                    className={`member-avatar ${m.role === 'Admin' ? 'member-avatar--admin' : 'member-avatar--reader'}`}
                    style={{ border: `2px solid ${roleColor(m.role)}`, color: roleColor(m.role) }}
                  >{initial}</div>
                )}
                <div className="member-info">
                  <div className="member-name">{displayName}</div>
                  {m.battleTag && m.characterName && (
                    <div className="member-tag">{m.battleTag}</div>
                  )}
                  <div className="member-role" style={{ color: roleColor(m.role) }}>{m.role}</div>
                </div>
                {isAdmin && m.role !== 'Admin' && (
                  <button
                    onClick={() => removeMember(m.id)}
                    title={t('members.remove')}
                    className="member-remove-btn"
                  >✕</button>
                )}
              </div>
              )
            })}
          </div>
        </div>

        {/* Pending members — admin only */}
        {isAdmin && (
          <div className="members-section">
            <h4 className="members-section-title">{t('members.pending')}</h4>
            {pending.length === 0 && <EmptyState icon="✅" message={t('members.noPending')} />}
            <div className="members-grid">
              {pending.map(p => {
                const displayName = p.characterName || p.battleTag || p.email || '?'
                const initial = displayName[0]?.toUpperCase() || '?'
                return (
                <div key={p.id} className="card member-card member-card--pending">
                  <div className="member-avatar member-avatar--pending">{initial}</div>
                  <div className="member-info">
                    <div className="member-name">{displayName}</div>
                    {p.battleTag && p.characterName && (
                      <div className="member-tag">{p.battleTag}</div>
                    )}
                    <div className="member-pending-label">{t('members.pending')}</div>
                  </div>
                  <div className="member-actions">
                    <button
                      onClick={() => approve(p.id)}
                      className="member-approve-btn"
                    >{t('members.approve')}</button>
                    <button
                      onClick={() => removeMember(p.id)}
                      title={t('members.remove')}
                      className="member-remove-btn"
                    >✕</button>
                  </div>
                </div>
                )
              })}
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  )
}
