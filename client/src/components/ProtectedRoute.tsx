import React, { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import api from '../services/api'
import { isDemoMode } from '../services/demoData'
import miniLogoImg from '../assets/mini_logo.png'

const ProtectedRoute: React.FC = () => {
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    const check = async () => {
      if (isDemoMode()) {
        setAuthorized(true)
        setLoading(false)
        return
      }

      const token = localStorage.getItem('accessToken')
      if (!token) {
        setAuthorized(false)
        setLoading(false)
        return
      }

      try {
        const r = await api.get('/api/auth/me')
        if (r.data?.isApproved) setAuthorized(true)
        else setAuthorized(false)
      } catch {
        localStorage.removeItem('accessToken')
        setAuthorized(false)
      } finally {
        setLoading(false)
      }
    }
    check()
  }, [])

  if (loading) return (
    <div className="loading-screen">
      <div className="loading-screen__content">
        <img src={miniLogoImg} alt="FairLoot" className="loading-screen__logo" draggable={false} />
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    </div>
  )
  if (!authorized) return <Navigate to="/login" replace />
  return <Outlet />
}

export default ProtectedRoute
