import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5177',
  withCredentials: true // important to send/receive HttpOnly cookie
})

// Authorization header will be added by interceptor

// response interceptor to handle 401 and try refresh
let isRefreshing = false
let failedQueue: any[] = []

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) prom.reject(error)
    else prom.resolve(token)
  })
  failedQueue = []
}

api.interceptors.response.use(
  r => r,
  async err => {
    const originalRequest = err.config
    const url = (originalRequest?.url || '').toString()
    // do not attempt refresh on auth endpoints
    if (url.includes('/api/auth/login') || url.includes('/api/auth/register') || url.includes('/api/auth/refresh')) {
      return Promise.reject(err)
    }

    if (err.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise(function (resolve, reject) {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            originalRequest.headers['Authorization'] = 'Bearer ' + token
            return api(originalRequest)
          })
          .catch(e => Promise.reject(e))
      }

      originalRequest._retry = true
      isRefreshing = true
      try {
        const r = await api.post('/api/auth/refresh', {})
        const newToken = r.data.token
        // store new token in localStorage
        localStorage.setItem('accessToken', newToken)
        api.defaults.headers.common['Authorization'] = 'Bearer ' + newToken
        processQueue(null, newToken)
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        // clear stale token so Home.tsx doesn't redirect back to /control
        localStorage.removeItem('accessToken')
        delete api.defaults.headers.common['Authorization']
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(err)
  }
)

// attach access token if present
api.interceptors.request.use(config => {
  const token = localStorage.getItem('accessToken')
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Render's free tier can take up to ~30-60s to wake a sleeping backend. A request that lands
// during that window comes back as a network error (no response) or a 5xx from the proxy before
// the app is actually listening — retrying a few times with a short wait rides through that
// instead of failing outright and forcing the user to restart the whole Battle.net flow.
export async function withColdStartRetry<T>(fn: () => Promise<T>, attempts = 6, delayMs = 5000): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err: any) {
      const status = err?.response?.status
      const looksLikeColdStart = !err?.response || status >= 500
      if (i === attempts - 1 || !looksLikeColdStart) throw err
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  throw new Error('unreachable')
}

export default api
