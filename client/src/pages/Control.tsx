import React, { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { logout } from '../services/auth'
import { useApp } from '../context/AppContext'
import api from '../services/api'
import { isDemoMode, exitDemoMode } from '../services/demoData'
import miniLogoImg from '../assets/mini_logo.png'

export default function Control() {
  const navigate = useNavigate()
  const { t, theme, setTheme, lang, setLang } = useApp()
  const [role, setRole] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const demo = isDemoMode()

  useEffect(() => {
    if (demo) {
      setRole('Admin')
      return
    }
    api.get('/api/auth/me').then(r => {
      const userRole = r.data?.role || null
      setRole(userRole)
      if (userRole === 'Admin') {
        api.get('/api/guild/members/pending').then(p => setPendingCount((p.data || []).length)).catch(() => {})
      }
    }).catch(() => {})
  }, [])

  const isAdmin = role === 'Admin'

  const handleLogout = async () => {
    if (demo) {
      exitDemoMode()
      navigate('/')
      return
    }
    try {
      await logout()
    } catch {
      // ignore
    }
    navigate('/')
  }

  return (
    <div className="control-shell">
      <nav className="control-tabs">
        <div className="nav-group nav-group--left">
          {isAdmin && <NavLink className={({ isActive }) => isActive ? 'tab active' : 'tab'} to="loot"><span className="tab-icon">🎯</span>{t('nav.loot')}</NavLink>}
          <NavLink className={({ isActive }) => isActive ? 'tab active' : 'tab'} to="wishlist"><span className="tab-icon">📋</span>{t('nav.wishlist')}</NavLink>
          <NavLink className={({ isActive }) => isActive ? 'tab active' : 'tab'} to="history"><span className="tab-icon">📜</span>{t('nav.history')}</NavLink>
        </div>

        <NavLink to="" end className="nav-logo">
          <img src={miniLogoImg} alt="FairLoot" draggable={false} />
        </NavLink>

        <div className="nav-group nav-group--right">
          <NavLink className={({ isActive }) => isActive ? 'tab active' : 'tab'} to="members">
            <span className="tab-icon">👤</span>{t('nav.members')}
            {isAdmin && pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}
          </NavLink>
          {isAdmin && <NavLink className={({ isActive }) => isActive ? 'tab active' : 'tab'} to="admin"><span className="tab-icon">⚙️</span>{t('nav.admin')}</NavLink>}
          <div className="nav-separator" />
          <button className="tab logout" onClick={handleLogout}><span className="tab-icon">🚪</span>{t('nav.logout')}</button>
          <div className="theme-picker">
            <button className={`theme-btn${theme === 'dark' ? ' active' : ''}`} onClick={() => setTheme('dark')} title="Dark">Dark</button>
            <button className={`theme-btn${theme === 'light' ? ' active' : ''}`} onClick={() => setTheme('light')} title="Light">Light</button>
            <button className={`theme-btn${theme === 'classic' ? ' active' : ''}`} onClick={() => setTheme('classic')} title="WoW Classic">WoW</button>
          </div>
          <button className="tab tab-lang" onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}>
            <span className="tab-icon">🌐</span>{lang === 'pt' ? 'EN' : 'PT'}
          </button>
        </div>
      </nav>

      <div className="container">
        {demo && (
          <div className="demo-banner">
            🔍 {lang === 'pt' ? 'Modo observação — alterações não são salvas' : 'Observation mode — changes are not saved'}
          </div>
        )}
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
