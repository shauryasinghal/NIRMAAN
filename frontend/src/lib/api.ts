import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { env } from './env'
import { supabase } from './supabase'

/** The API's one error contract: { error: { code, message, details?, requestId } } */
export class ApiError extends Error {
  status: number
  code: string
  details?: Record<string, unknown>
  requestId?: string
  constructor(status: number, code: string, message: string, details?: Record<string, unknown>, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status; this.code = code; this.details = details; this.requestId = requestId
  }
  /** Field-level messages for form errors, keyed by field name. */
  get fields(): Record<string, string> {
    const list = (this.details?.fields as { field: string; message: string }[] | undefined) ?? []
    return Object.fromEntries(list.map((f) => [f.field, f.message]))
  }
}

export const apiClient = axios.create({ baseURL: env.apiUrl || '', timeout: 30_000, headers: { 'Content-Type': 'application/json' } })

apiClient.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) config.headers.Authorization = `Bearer ${data.session.access_token}`
  return config
})

let refreshing: Promise<boolean> | null = null
async function refreshOnce(): Promise<boolean> {
  refreshing ??= supabase.auth.refreshSession().then(({ data, error }) => !error && !!data.session).finally(() => { refreshing = null })
  return refreshing
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  const e = error as AxiosError<{ error?: { code: string; message: string; details?: Record<string, unknown>; requestId?: string } }>
  if (e.response) {
    const body = e.response.data?.error
    return new ApiError(e.response.status, body?.code ?? 'server_error', body?.message ?? 'Something went wrong. Please try again.', body?.details, body?.requestId)
  }
  if (e.code === 'ECONNABORTED') return new ApiError(0, 'timeout', 'The request took too long. Please try again.')
  return new ApiError(0, 'network_error', "We couldn't reach the server. Check your connection and try again.")
}

apiClient.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const cfg = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined
    if (error.response?.status === 401 && cfg && !cfg._retried) {
      cfg._retried = true
      if (await refreshOnce()) return apiClient(cfg)
      await supabase.auth.signOut()
      if (!window.location.pathname.startsWith('/login')) window.location.assign('/login?expired=1')
    }
    return Promise.reject(toApiError(error))
  },
)
