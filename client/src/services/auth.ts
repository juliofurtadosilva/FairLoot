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

export const register = async (params: {
  guildName: string
  server: string
  email: string
  password: string
  wowauditKey?: string
  realmSlug?: string
  region?: string
  characterName?: string
}) => {
  const payload: any = {
    guildName: params.guildName,
    server: params.server,
    email: params.email,
    password: params.password,
  }
  if (params.wowauditKey) payload.wowauditApiKey = params.wowauditKey
  if (params.realmSlug) payload.realmSlug = params.realmSlug
  if (params.region) payload.region = params.region
  if (params.characterName) payload.characterName = params.characterName
  const r = await api.post('/api/auth/register', payload)
  const token = r.data.token
  if (token) {
    localStorage.setItem('accessToken', token)
    api.defaults.headers.common['Authorization'] = 'Bearer ' + token
  }
  return r.data
}

export const bnetRegister = async (params: {
  sessionId: string
  characterIndex: number
  wowauditApiKey?: string
}) => {
  const r = await api.post('/api/auth/bnet/register', params)
  const token = r.data.token
  if (token) {
    localStorage.setItem('accessToken', token)
    api.defaults.headers.common['Authorization'] = 'Bearer ' + token
  }
  return r.data
}

export const bnetLogin = async (params: {
  code: string
  redirectUri: string
  region: string
}) => {
  const r = await api.post('/api/auth/bnet/login', params)
  const token = r.data.token
  if (token) {
    localStorage.setItem('accessToken', token)
    api.defaults.headers.common['Authorization'] = 'Bearer ' + token
  }
  return r.data
}

export const bnetLoginSelect = async (params: {
  sessionId: string
  userId: string
}) => {
  const r = await api.post('/api/auth/bnet/login/select', params)
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
