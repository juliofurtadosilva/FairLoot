import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { register } from '../services/auth'

export default function Register() {
  const [guildName, setGuildName] = useState('')
  const [server, setServer] = useState('')
  const [wowauditKey, setWowauditKey] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handle = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await register(guildName, server, email, password, wowauditKey || undefined)
      if (res?.token) {
        navigate('/control')
      } else if (res?.message) {
        // show server message (e.g., pending approval)
        setError(String(res.message))
      } else {
        navigate('/login')
      }
    } catch (err: any) {
      setError(err?.response?.data || 'Erro no registro')
    }
  }

  return (
    <div className="container">
      <h2>Register</h2>
      <form onSubmit={handle}>
        <div>
          <label>Guild Name</label>
          <br />
          <input value={guildName} onChange={e => setGuildName(e.target.value)} />
        </div>
        <div>
          <label>Server</label>
          <br />
          <input value={server} onChange={e => setServer(e.target.value)} />
        </div>
        <div>
          <label>Email</label>
          <br />
          <input value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div>
          <label>WowAudit API Key (opcional)</label>
          <br />
          <input value={wowauditKey} onChange={e => setWowauditKey(e.target.value)} />
          <div style={{ fontSize: 12, color: '#98a2b3' }}>Se a guilda já existir, não sobrescreverá a chave existente; serve para criar a guild com a chave.</div>
        </div>
        <div>
          <label>Password</label>
          <br />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <button type="submit">Register</button>
      </form>
      {error && <div style={{ color: 'red' }}>{String(error)}</div>}
    </div>
  )
}
