import React, { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import api from '../services/api'

const ProtectedRoute: React.FC = () => {
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    const check = async () => {
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

  if (loading) return <div>Loading...</div>
  if (!authorized) return <Navigate to="/login" replace />
  return <Outlet />
}

export default ProtectedRoute
