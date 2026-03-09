import React, { useEffect, useState } from 'react'
import api from '../services/api'
import { logout } from '../services/auth'
import { useNavigate } from 'react-router-dom'

export default function Guild() {
  const [guild, setGuild] = useState<any>(null)
  const [me, setMe] = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<any>({})
  const [error, setError] = useState<string | null>(null)

  const fetchGuild = async () => {
    try {
      const r = await api.get('/api/guild')
      setGuild(r.data)
      setForm(r.data)
    } catch (err: any) {
      setError(err?.response?.data || 'Erro ao buscar guild')
    }
  }

  const fetchMe = async () => {
    try {
      const r = await api.get('/api/auth/me')
      setMe(r.data)
    } catch {
    }
  }

  useEffect(() => { fetchGuild() }, [])
  useEffect(() => { fetchMe() }, [])

  const handleLogout = async () => {
    try {
      await logout()
      window.location.href = '/login'
    } catch {
      window.location.href = '/login'
    }
  }

  const navigate = useNavigate()

  const goBack = () => navigate('/control')

  return (
    <div className="container">
      <h2>My Guild</h2>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {guild ? (
        <div>
          <div><strong>Name:</strong> {guild.name}</div>
          <div><strong>Server:</strong> {guild.server}</div>
          <div><strong>Wowaudit Key:</strong> {guild.wowauditApiKey || '—'}</div>
          <div><strong>Priority Alpha:</strong> {guild.priorityAlpha ?? 0.7}</div>
          {me?.role === 'Admin' && (
            <div style={{ marginTop: 12 }}>
              {!editing ? (
                <button onClick={() => setEditing(true)}>Editar configurações</button>
              ) : (
                <div>
                  <div>
                    <label>Wowaudit API Key: </label>
                    <input value={form.wowauditApiKey || ''} onChange={e => setForm({ ...form, wowauditApiKey: e.target.value })} />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <label>Priority Alpha (0..1): </label>
                    <input type="number" step="0.01" min={0} max={1} value={form.priorityAlpha ?? 0.7} onChange={e => setForm({ ...form, priorityAlpha: Number(e.target.value) })} />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <button onClick={async () => {
                      try {
                        await api.put('/api/guild', form)
                        setEditing(false)
                        fetchGuild()
                      } catch (e) { console.error(e) }
                    }}>Salvar</button>
                    <button onClick={() => setEditing(false)} style={{ marginLeft: 8 }}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          )}
          <div><strong>CreatedAt:</strong> {guild.createdAt}</div>
          <div style={{ marginTop: 10 }}>
            <button onClick={fetchGuild}>Refresh</button>
            <button onClick={goBack} style={{ marginLeft: 8 }}>Back</button>
            <button onClick={handleLogout} style={{ marginLeft: 8 }}>Logout</button>
          </div>
        </div>
      ) : (
        <div>Loading...</div>
      )}
    </div>
  )
}
