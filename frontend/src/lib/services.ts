import { apiClient } from './api'
import type {
  Alert, AlertEvaluation, AlertHit, AlertInput, ActivityItem, AdminUser, Application, ApplicationInsight, ApplicationList, ApplicationStatus, AuditEntry,
  AuthConfig, CompareResult, Dashboard, Facets, IdeaHistoryItem, IdeaResult, IngestionOverview, IntegrationStatus, Me, NotificationItem, NotificationPage,
  NotificationPrefs, OpportunityDetailData, OpportunityFilters, OpportunityPage, OrganizationDetail, OrganizationSummary, Page, Profile, ProfileUpdate,
  Recommendations, ResumeExtraction, ReviewDecisionKind, ReviewDetail, ReviewQueue, Signals, SkillGap, TeamRecord, TeamSuggestion, VocabItem,
} from '../types'

const get = <T>(url: string, params?: object) => apiClient.get<T>(url, { params }).then((r) => r.data)
const post = <T>(url: string, body?: unknown) => apiClient.post<T>(url, body).then((r) => r.data)
const put = <T>(url: string, body?: unknown) => apiClient.put<T>(url, body).then((r) => r.data)
const patch = <T>(url: string, body?: unknown) => apiClient.patch<T>(url, body).then((r) => r.data)
const del = (url: string) => apiClient.delete(url).then(() => undefined)

/** Filters → query params. Arrays repeat (`category=a&category=b`); unset values are omitted. */
export function filterParams(f: OpportunityFilters): URLSearchParams {
  const p = new URLSearchParams()
  const add = (k: string, v: unknown) => { if (v !== undefined && v !== null && v !== '' && v !== false) p.append(k, String(v)) }
  add('q', f.q)
  ;(['category', 'domain', 'skill', 'difficulty', 'format', 'participation', 'freshness'] as const).forEach((k) => f[k].forEach((v) => add(k, v)))
  f.workMode.forEach((v) => add('work_mode', v))
  add('team_size', f.teamSize); add('location', f.location); add('eligibility', f.eligibility); add('deadline_within', f.deadlineWithin)
  add('verified', f.verified); add('include_expired', f.includeExpired)
  return p
}

export const authService = {
  me: () => get<Me>('/api/auth/me'),
  config: () => get<AuthConfig>('/api/auth/config'),
}

export const profileService = {
  get: () => get<Profile>('/api/profile'),
  update: (data: ProfileUpdate) => put<Profile>('/api/profile', data),
  confirmSkill: (name: string) => post<Profile>(`/api/profile/skills/${encodeURIComponent(name)}/confirm`),
  removeSkill: (name: string) => del(`/api/profile/skills/${encodeURIComponent(name)}`),
  removeItem: (id: string) => del(`/api/profile/items/${id}`),
  skills: () => get<VocabItem[]>('/api/skills'),
  interests: () => get<VocabItem[]>('/api/interests'),
  extractResume: (file: File) => {
    const fd = new FormData(); fd.append('file', file)
    return apiClient.post<ResumeExtraction>('/api/profile/resume/extract', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
  },
  confirmResume: (body: { confirmSkills: string[]; suggestSkills: { name: string; evidence: string }[]; updateName?: string | null; links: Record<string, string>; items: Record<string, string[]> }) =>
    post<{ changed: Record<string, unknown>; profile: Profile }>('/api/profile/resume/confirm', body),
}

export const opportunityService = {
  search: (f: OpportunityFilters, pageSize = 12) => {
    const p = filterParams(f)
    p.set('sort', f.sort); p.set('page', String(f.page)); p.set('page_size', String(pageSize))
    if (f.minFit) p.set('min_fit', String(f.minFit))
    return get<OpportunityPage>(`/api/opportunities?${p}`)
  },
  facets: (f: OpportunityFilters) => get<Facets>(`/api/opportunities/facets?${filterParams(f)}`),
  recommendations: (limit = 10) => get<Recommendations>('/api/opportunities/recommendations', { limit }),
  detail: (id: string) => get<OpportunityDetailData>(`/api/opportunities/${id}`),
  compare: (ids: string[]) => post<CompareResult>('/api/opportunities/compare', { ids }),
  event: (id: string, type: 'view' | 'dismiss' | 'compare') => apiClient.post(`/api/opportunities/${id}/events`, { type }).then(() => undefined),
  icsUrl: (id: string) => `/api/opportunities/${id}/calendar.ics`,
  downloadIcs: async (id: string) => {
    const r = await apiClient.get(`/api/opportunities/${id}/calendar.ics`, { responseType: 'blob' })
    const url = URL.createObjectURL(r.data as Blob)
    const a = document.createElement('a'); a.href = url; a.download = 'nirmaan-deadline.ics'; a.click(); URL.revokeObjectURL(url)
  },
}

export const savedService = {
  list: () => get<{ items: OpportunityDetailData[]; total: number }>('/api/saved'),
  save: (id: string) => apiClient.put(`/api/saved/${id}`).then(() => undefined),
  unsave: (id: string) => del(`/api/saved/${id}`),
}

export const applicationService = {
  list: () => get<ApplicationList>('/api/applications'),
  get: (id: string) => get<Application>(`/api/applications/${id}`),
  create: (opportunityId: string, status: ApplicationStatus = 'wishlist') => post<Application>('/api/applications', { opportunityId, status }),
  update: (id: string, data: Partial<{ status: ApplicationStatus; notes: string; nextAction: string | null; reminderAt: string | null }>) => patch<Application>(`/api/applications/${id}`, data),
  remove: (id: string) => del(`/api/applications/${id}`),
  insights: () => get<{ items: ApplicationInsight[] }>('/api/applications/insights'),
}

export const alertService = {
  list: () => get<Alert[]>('/api/alerts'),
  create: (d: AlertInput) => post<Alert>('/api/alerts', d),
  update: (id: string, d: Partial<AlertInput>) => patch<Alert>(`/api/alerts/${id}`, d),
  remove: (id: string) => del(`/api/alerts/${id}`),
  evaluate: (id: string) => post<AlertEvaluation>(`/api/alerts/${id}/evaluate`),
  hits: (id: string) => get<{ items: AlertHit[] }>(`/api/alerts/${id}/hits`),
}

export const notificationService = {
  list: (unread = false, page = 1) => get<NotificationPage>('/api/notifications', { unread, page, page_size: 20 }),
  unreadCount: () => get<{ unread: number }>('/api/notifications/unread-count'),
  markRead: (id: string) => post<{ ok: boolean }>(`/api/notifications/${id}/read`),
  markAllRead: () => post<{ ok: boolean }>('/api/notifications/read-all'),
  prefs: () => get<NotificationPrefs>('/api/notifications/preferences'),
  setPrefs: (d: Partial<NotificationPrefs>) => put<NotificationPrefs>('/api/notifications/preferences', d),
}
export type { NotificationItem }

export const activityService = {
  list: (page = 1) => get<{ items: ActivityItem[]; total: number; page: number; pageSize: number }>('/api/activity', { page }),
  signals: () => get<Signals>('/api/activity/signals'),
  resetSignals: () => del('/api/activity/signals'),
}

export const dashboardService = {
  get: () => get<Dashboard>('/api/dashboard'),
  skills: () => get<{ gaps: SkillGap[]; confirmedSkills: string[]; inferredSkills: string[]; opportunitiesConsidered: number; method: string }>('/api/skills/intelligence'),
}

export const organizationService = {
  list: (q?: string, page = 1) => get<Page<OrganizationSummary>>('/api/organizations', { q: q || undefined, page, page_size: 24 }),
  detail: (slug: string) => get<OrganizationDetail>(`/api/organizations/${encodeURIComponent(slug)}`),
}

export const teamService = {
  suggest: (d: { opportunityId?: string | null; requiredSkills?: string[]; preferredSkills?: string[]; size: number }) => post<TeamSuggestion>('/api/teams/suggest', d),
  save: (d: { opportunityId?: string | null; requiredSkills?: string[]; preferredSkills?: string[]; size: number; memberIds: string[]; name?: string; note?: string }) => post<TeamRecord>('/api/teams', d),
  list: () => get<{ items: TeamRecord[] }>('/api/teams'),
  respond: (id: string, accept: boolean) => post<Partial<TeamRecord>>(`/api/teams/${id}/respond`, { accept }),
  remove: (id: string) => del(`/api/teams/${id}`),
}

export const ideaService = {
  check: (d: { title: string; description: string; domain?: string | null; opportunityId?: string | null }) => post<IdeaResult>('/api/originality/check', d),
  list: () => get<{ items: IdeaHistoryItem[] }>('/api/ideas'),
  get: (id: string) => get<IdeaResult>(`/api/ideas/${id}`),
  remove: (id: string) => del(`/api/ideas/${id}`),
}

export const reviewerService = {
  queue: (state: 'pending' | 'escalated' | 'all' = 'pending') => get<ReviewQueue>('/api/reviewer/queue', { state }),
  detail: (id: string) => get<ReviewDetail>(`/api/reviewer/reviews/${id}`),
  decide: (id: string, decision: ReviewDecisionKind, note?: string) => post<{ decisionId: string }>(`/api/reviewer/reviews/${id}/decision`, { decision, note: note || undefined }),
}

export const adminService = {
  users: (q?: string, role?: string, page = 1) => get<Page<AdminUser>>('/api/admin/users', { q: q || undefined, role: role || undefined, page }),
  setRole: (id: string, role: string) => put<{ id: string; role: string }>(`/api/admin/users/${id}/role`, { role }),
  audit: (action?: string, page = 1) => get<Page<AuditEntry>>('/api/admin/audit', { action: action || undefined, page }),
  ingestion: () => get<IngestionOverview>('/api/admin/ingestion'),
  runIngestion: (source: string) => post<Record<string, unknown>>(`/api/admin/ingestion/${source}/run`),
}

export const integrationService = {
  status: () => get<IntegrationStatus>('/api/integrations'),
  connect: (provider: 'calendar' | 'gmail') => post<{ authorizationUrl: string }>(`/api/integrations/google/${provider}/connect`),
  callback: (provider: 'calendar' | 'gmail', code: string, state: string) => post<{ provider: string }>('/api/integrations/google/callback', { provider, code, state }),
  disconnect: (provider: 'calendar' | 'gmail') => del(`/api/integrations/google/${provider}`),
  addToCalendar: (opportunityId: string) => post<{ eventId: string; htmlLink: string }>('/api/integrations/google/calendar/events', { opportunityId, confirm: true }),
  emailReminder: (opportunityId: string) => post<{ messageId: string }>('/api/integrations/google/gmail/send-reminder', { opportunityId, confirm: true }),
}
