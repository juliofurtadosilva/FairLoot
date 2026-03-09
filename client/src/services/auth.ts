import api from './api'

export const login = async (email: string, password: string) => {
  const r = await api.post('/api/auth/login', { email, password })
  const token = r.data.token
  if (token) {
    localStorage.setItem('accessToken', token)
    api.defaults.headers.common['Authorization'] = 'Bearer ' + token
  }
  return r.data
}

export const register = async (guildName: string, server: string, email: string, password: string, wowauditKey?: string) => {
  const payload: any = { guildName, server, email, password }
  if (wowauditKey) payload.wowauditApiKey = wowauditKey
  const r = await api.post('/api/auth/register', payload)
  const token = r.data.token
  if (token) {
    localStorage.setItem('accessToken', token)
    api.defaults.headers.common['Authorization'] = 'Bearer ' + token
  }
  return r.data
}

export const logout = async () => {
  await api.post('/api/auth/logout')
  localStorage.removeItem('accessToken')
  delete api.defaults.headers.common['Authorization']
}

export const revoke = async (refreshToken?: string) => {
  await api.post('/api/auth/revoke', refreshToken ? { refreshToken } : {})
}
