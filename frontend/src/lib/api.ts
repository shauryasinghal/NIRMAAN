import axios from 'axios'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('nirmaan_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('nirmaan_token')
      localStorage.removeItem('nirmaan_role')
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login?expired=1'
      }
    }
    const message =
      error.response?.data?.detail?.message ||
      error.response?.data?.detail ||
      error.message ||
      'Something went wrong'
    return Promise.reject(new Error(message))
  },
)
