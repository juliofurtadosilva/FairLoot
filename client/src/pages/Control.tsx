import React, { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { logout } from '../services/auth'
import { useApp } from '../context/AppContext'
import api from '../services/api'
import { isDemoMode, exitDemoMode } from '../services/demoData'
import sidebarLogoImg from '../assets/logo-retang.png'

const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const NavIcons: Record<string, React.ReactNode> = {
  home: (
    <svg {...svgProps}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  ),
  loot: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  ),
  wishlist: (
    <svg {...svgProps}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <rect x="9" y="2.3" width="6" height="3" rx="1" />
      <line x1="8" y1="10.5" x2="16" y2="10.5" />
      <line x1="8" y1="14" x2="16" y2="14" />
      <line x1="8" y1="17.5" x2="13" y2="17.5" />
    </svg>
  ),
  history: (
    <svg {...svgProps}>
      <path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M15 3v4h4" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="15.5" x2="16" y2="15.5" />
      <line x1="8" y1="19" x2="13" y2="19" />
    </svg>
  ),
  members: (
    <svg {...svgProps}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2" />
    </svg>
  ),
  admin: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.4M12 18.6V21M4.9 6.9l1.7 1.7M17.4 15.4l1.7 1.7M3 12h2.4M18.6 12H21M4.9 17.1l1.7-1.7M17.4 8.6l1.7-1.7" />
    </svg>
  ),
  reports: (
    <svg {...svgProps}>
      <path d="M12 5v9" />
      <path d="M8 10l4 4 4-4" />
      <path d="M5 15v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />
    </svg>
  ),
  logout: (
    <svg {...svgProps}>
      <path d="M9 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h4" />
      <path d="M14 8l4 4-4 4" />
      <line x1="18" y1="12" x2="9" y2="12" />
    </svg>
  ),
}

const PENDING_POLL_MS = 60000

export default function Control() {
  const navigate = useNavigate()
  const { t, theme, setTheme, lang, setLang, showToast } = useApp()
  const [role, setRole] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const demo = isDemoMode()

  useEffect(() => {
    if (demo) {
      setRole('Admin')
      return
    }
    let interval: ReturnType<typeof setInterval> | undefined
    let knownCount: number | null = null

    const pollPending = () => {
      api.get('/api/guild/members/pending').then(p => {
        const count = (p.data || []).length
        setPendingCount(count)
        if (knownCount !== null && count > knownCount) {
          const diff = count - knownCount
          showToast(diff === 1 ? t('members.newPendingOne') : `${diff} ${t('members.newPendingMany')}`, 'info')
        }
        knownCount = count
      }).catch(() => {})
    }

    api.get('/api/auth/me').then(r => {
      const userRole = r.data?.role || null
      setRole(userRole)
      if (userRole === 'Admin') {
        pollPending()
        interval = setInterval(pollPending, PENDING_POLL_MS)
      }
    }).catch(() => {})

    return () => { if (interval) clearInterval(interval) }
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

  const navLinkClass = ({ isActive }: { isActive: boolean }) => isActive ? 'side-link active' : 'side-link'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src={sidebarLogoImg} alt="FairLoot" draggable={false} className="sidebar-logo-img" />
        </div>

        <nav className="sidebar-nav">
          <NavLink className={navLinkClass} to="" end title={t('nav.home')}>
            <span className="side-label">{t('nav.home')}</span>
            <span className="side-icon">{NavIcons.home}</span>
          </NavLink>
          {isAdmin && (
            <NavLink className={navLinkClass} to="loot" title={t('nav.loot')}>
              <span className="side-label">{t('nav.loot')}</span>
              <span className="side-icon">{NavIcons.loot}</span>
            </NavLink>
          )}
          <NavLink className={navLinkClass} to="wishlist" title={t('nav.wishlist')}>
            <span className="side-label">{t('nav.wishlist')}</span>
            <span className="side-icon">{NavIcons.wishlist}</span>
          </NavLink>
          {isAdmin && (
            <NavLink className={navLinkClass} to="reports" title={t('nav.reports')}>
              <span className="side-label">{t('nav.reports')}</span>
              <span className="side-icon">{NavIcons.reports}</span>
            </NavLink>
          )}
          <NavLink className={navLinkClass} to="history" title={t('nav.history')}>
            <span className="side-label">{t('nav.history')}</span>
            <span className="side-icon">{NavIcons.history}</span>
          </NavLink>
          <NavLink className={navLinkClass} to="members" title={t('nav.members')}>
            <span className="side-label">{t('nav.members')}</span>
            {isAdmin && pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}
            <span className="side-icon">{NavIcons.members}</span>
          </NavLink>
          {isAdmin && (
            <NavLink className={navLinkClass} to="admin" title={t('nav.admin')}>
              <span className="side-label">{t('nav.admin')}</span>
              <span className="side-icon">{NavIcons.admin}</span>
            </NavLink>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="theme-picker theme-picker--stacked">
            <button className={`theme-btn${theme === 'dark' ? ' active' : ''}`} onClick={() => setTheme('dark')} title="Dark">Dark</button>
            <button className={`theme-btn${theme === 'light' ? ' active' : ''}`} onClick={() => setTheme('light')} title="Light">Light</button>
            <button className={`theme-btn${theme === 'classic' ? ' active' : ''}`} onClick={() => setTheme('classic')} title="WoW Classic">WoW</button>
          </div>
          <div className="theme-picker theme-picker--stacked lang-picker">
            <button className={`theme-btn${lang === 'pt' ? ' active' : ''}`} onClick={() => setLang('pt')} title="Português">PT</button>
            <button className={`theme-btn${lang === 'en' ? ' active' : ''}`} onClick={() => setLang('en')} title="English">EN</button>
          </div>
          <button className="side-link side-link--logout" onClick={handleLogout} title={t('nav.logout')}>
            <span className="side-label">{t('nav.logout')}</span>
            <span className="side-icon">{NavIcons.logout}</span>
          </button>
        </div>
      </aside>

      <div className="main-area">
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
    </div>
  )
}
