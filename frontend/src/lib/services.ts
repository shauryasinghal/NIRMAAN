import { apiClient } from './api'
import type {
  Profile,
  Opportunity,
  RecommendedOpportunity,
  TeamResult,
  IdeaCheckResult,
  HistoryItem,
  ReviewQueueItem,
  Role,
  SavedOpportunity,
  Application,
  ApplicationStatus,
  ApplicationEvent,
  NotificationItem,
  SavedSearch,
  ActivityItem,
  OrganizationSummary,
  OrganizationDetail,
  NextBestAction,
  WhyNotResult,
  SkillGapItem,
  ApplicationInsight,
} from '../types'

// ---- auth ----
export const authService = {
  register: (data: { name: string; email: string; password: string }) =>
    apiClient.post<{ id: string }>('/api/auth/register', data).then((r) => r.data),
  login: (data: { email: string; password: string }) =>
    apiClient
      .post<{ access_token: string; role: Role }>('/api/auth/login', data)
      .then((r) => r.data),
}

// ---- profile ----
export const profileService = {
  get: () => apiClient.get<Profile>('/api/profile').then((r) => r.data),
  update: (data: Partial<Profile>) =>
    apiClient.put<Profile>('/api/profile', data).then((r) => r.data),
}

// ---- opportunities ----
export const opportunityService = {
  list: (params?: { domain?: string; skill?: string; category?: string; format?: string; participation?: string; limit?: number }) =>
    apiClient
      .get<{ items: Opportunity[]; total: number }>('/api/opportunities', { params })
      .then((r) => r.data),
  categories: () => apiClient.get<{ items: string[] }>('/api/opportunities/categories').then((r) => r.data),
  recommend: (topK = 10) =>
    apiClient
      .get<{ items: RecommendedOpportunity[]; total: number }>(
        `/api/opportunities/recommend?topK=${topK}`,
      )
      .then((r) => r.data),
  detail: (id: string) => apiClient.get<Opportunity>(`/api/opportunities/${id}`).then((r) => r.data),
}

// ---- team ----
export const teamService = {
  suggest: (data: { target_skills: string[]; team_size: number }) =>
    apiClient.post<TeamResult>('/api/team/suggest', data).then((r) => r.data),
}

// ---- originality ----
export const originalityService = {
  check: (data: { title: string; description: string; domain?: string }) =>
    apiClient.post<IdeaCheckResult>('/api/idea/check', data).then((r) => r.data),
  history: () =>
    apiClient.get<{ items: HistoryItem[] }>('/api/idea/history').then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/api/idea/history/${id}`).then((r) => r.data),
}

// ---- reviewer ----
export const reviewerService = {
  queue: () =>
    apiClient.get<{ items: ReviewQueueItem[] }>('/api/reviewer/queue').then((r) => r.data),
  decide: (reviewId: string, decision: 'confirm_overlap' | 'dismiss' | 'needs_review') =>
    apiClient.post(`/api/reviewer/${reviewId}/decision`, { decision }).then((r) => r.data),
}

// ---- saved opportunities ----
export const savedService = {
  save: (opportunityId: string) => apiClient.post(`/api/opportunities/${opportunityId}/save`).then((r) => r.data),
  unsave: (opportunityId: string) => apiClient.delete(`/api/opportunities/${opportunityId}/save`).then((r) => r.data),
  isSaved: (opportunityId: string) =>
    apiClient.get<{ saved: boolean }>(`/api/opportunities/${opportunityId}/saved`).then((r) => r.data),
  list: () => apiClient.get<{ items: SavedOpportunity[]; total: number }>('/api/saved-opportunities').then((r) => r.data),
}

// ---- applications ----
export const applicationService = {
  list: () =>
    apiClient.get<{ items: Application[]; total: number; statuses: ApplicationStatus[] }>('/api/applications').then((r) => r.data),
  create: (opportunityId: string, status: ApplicationStatus = 'wishlist') =>
    apiClient.post<Application>('/api/applications', { opportunity_id: opportunityId, status }).then((r) => r.data),
  update: (id: string, data: Partial<{ status: ApplicationStatus; notes: string; next_action: string; reminder_at: string }>) =>
    apiClient.patch<Application>(`/api/applications/${id}`, data).then((r) => r.data),
  activity: (id: string) => apiClient.get<{ items: ApplicationEvent[] }>(`/api/applications/${id}/activity`).then((r) => r.data),
}

// ---- notifications ----
export const notificationService = {
  list: () => apiClient.get<{ items: NotificationItem[]; unreadCount: number }>('/api/notifications').then((r) => r.data),
  markRead: (id: string) => apiClient.patch(`/api/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => apiClient.post('/api/notifications/read-all').then((r) => r.data),
}

// ---- saved searches ----
export const savedSearchService = {
  list: () => apiClient.get<{ items: SavedSearch[] }>('/api/saved-searches').then((r) => r.data),
  create: (data: { name: string; query?: string; domain?: string; skill?: string; min_fit?: number; enabled?: boolean }) =>
    apiClient.post<SavedSearch>('/api/saved-searches', data).then((r) => r.data),
  update: (id: string, data: { name: string; query?: string; domain?: string; skill?: string; min_fit?: number; enabled?: boolean }) =>
    apiClient.patch<SavedSearch>(`/api/saved-searches/${id}`, data).then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/api/saved-searches/${id}`).then((r) => r.data),
}

// ---- activity ----
export const activityService = {
  list: (limit = 30) => apiClient.get<{ items: ActivityItem[] }>(`/api/activity?limit=${limit}`).then((r) => r.data),
}

// ---- organizations ----
export const organizationService = {
  list: () => apiClient.get<{ items: OrganizationSummary[] }>('/api/organizations').then((r) => r.data),
  detail: (name: string) => apiClient.get<OrganizationDetail>(`/api/organizations/${encodeURIComponent(name)}`).then((r) => r.data),
}

// ---- intelligence ----
export const intelligenceService = {
  nextBestAction: () => apiClient.get<{ action: NextBestAction | null }>('/api/intelligence/next-best-action').then((r) => r.data),
  whyNot: (opportunityId: string) => apiClient.get<WhyNotResult>(`/api/intelligence/why-not/${opportunityId}`).then((r) => r.data),
  skillGaps: () => apiClient.get<{ items: SkillGapItem[] }>('/api/intelligence/skill-gaps').then((r) => r.data),
  applicationInsights: () => apiClient.get<{ items: ApplicationInsight[] }>('/api/intelligence/application-insights').then((r) => r.data),
}

export const alertEvaluationService = {
  evaluate: (searchId: string) =>
    apiClient.post<{ matchCount: number; items: RecommendedOpportunity[] }>(`/api/saved-searches/${searchId}/evaluate`).then((r) => r.data),
}

// ---- Google OAuth ----
export const googleAuthService = {
  status: () => apiClient.get<{ configured: boolean }>('/api/auth/google/status').then((r) => r.data),
  loginUrl: () => apiClient.get<{ authorizationUrl: string }>('/api/auth/google/login').then((r) => r.data),
  callback: (code: string, state: string) =>
    apiClient.get<{ access_token: string; role: Role; isNewProfile: boolean }>(
      `/api/auth/google/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    ).then((r) => r.data),
}

// ---- Google Calendar (optional, separate consent) ----
export const calendarService = {
  status: () => apiClient.get<{ configured: boolean; connected: boolean }>('/api/integrations/google/calendar/status').then((r) => r.data),
  connectUrl: () => apiClient.get<{ authorizationUrl: string }>('/api/integrations/google/calendar/connect').then((r) => r.data),
  disconnect: () => apiClient.delete('/api/integrations/google/calendar').then((r) => r.data),
  downloadIcs: (opportunityId: string, filename: string) =>
    apiClient.get(`/api/opportunities/${opportunityId}/calendar.ics`, { responseType: 'blob' }).then((r) => {
      const url = window.URL.createObjectURL(new Blob([r.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    }),
  createEvent: (opportunityId: string) =>
    apiClient.post<{ created: boolean; eventUrl?: string }>(`/api/opportunities/${opportunityId}/calendar-event`).then((r) => r.data),
}

// ---- Resume upload ----
export const resumeService = {
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<{
      extracted: { name: string | null; email: string | null; github: string | null; linkedin: string | null; existingSkills: string[]; newSkills: string[] }
      method: string
    }>('/api/profile/resume/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
  },
  confirm: (data: { skillsToAdd: string[]; updateName?: string }) =>
    apiClient.post<{ skills: string[]; name: string }>('/api/profile/resume/confirm', data).then((r) => r.data),
}
