import React, { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { logout } from '../services/auth'
import { useApp } from '../context/AppContext'
import api from '../services/api'
import { isDemoMode, exitDemoMode } from '../services/demoData'
import miniLogoImg from '../assets/mini_logo.png'

export default function Control() {
  const navigate = useNavigate()
  const { t, theme, toggleTheme, lang, setLang } = useApp()
  const [role, setRole] = useState<string | null>(null)
  const demo = isDemoMode()

  useEffect(() => {
    if (demo) {
      setRole('Admin')
      return
    }
    api.get('/api/auth/me').then(r => setRole(r.data?.role || null)).catch(() => {})
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
          {isAdmin && <NavLink className={({ isActive }) => isActive ? 'tab active' : 'tab'} to="loot">{t('nav.loot')}</NavLink>}
          <NavLink className={({ isActive }) => isActive ? 'tab active' : 'tab'} to="wishlist">{t('nav.wishlist')}</NavLink>
          <NavLink className={({ isActive }) => isActive ? 'tab active' : 'tab'} to="history">{t('nav.history')}</NavLink>
        </div>

        <NavLink to="" end className="nav-logo">
          <img src={miniLogoImg} alt="FairLoot" draggable={false} />
        </NavLink>

        <div className="nav-group nav-group--right">
          <NavLink className={({ isActive }) => isActive ? 'tab active' : 'tab'} to="members">{t('nav.members')}</NavLink>
          {isAdmin && <NavLink className={({ isActive }) => isActive ? 'tab active' : 'tab'} to="admin">{t('nav.admin')}</NavLink>}
          <button className="tab logout" onClick={handleLogout}>{t('nav.logout')}</button>
          <button className="tab" onClick={toggleTheme} title={theme === 'dark' ? 'Light mode' : 'Dark mode'} style={{ fontSize: 16, padding: '6px 10px' }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button className="tab" onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')} style={{ fontSize: 12, padding: '6px 10px', fontWeight: 700 }}>
            {lang === 'pt' ? 'EN' : 'PT'}
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
