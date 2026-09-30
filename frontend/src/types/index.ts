export type Role = 'STUDENT' | 'REVIEWER'

export interface Profile {
  id: string
  name: string
  email: string
  year?: string | null
  branch?: string | null
  skills: string[]
  interests: string[]
  experience_level: string
  availability_hrs: number
  profile_complete: boolean
}

export interface Opportunity {
  id: string
  title: string
  organization: string
  domain: string
  skills: string[]
  deadline?: string | null
  daysRemaining?: number | null
  urgency?: 'critical' | 'soon' | 'open' | 'expired' | 'unknown'
  isExpired?: boolean
  format: string
  difficulty?: string
  source: string
  externalUrl: string
  description?: string
  category?: string | null
  participation?: 'individual' | 'team' | null
  minTeamSize?: number | null
  maxTeamSize?: number | null
  sourceType?: 'official' | 'aggregator'
  updatedAt?: string | null
}

export interface RecommendedOpportunity extends Opportunity {
  fitScore: number
  matchedSkills: string[]
  missingSkills: string[]
  reason: string
}

export interface TeamMember {
  id: string
  name: string
  skills: string[]
  matchedSkills: string[]
  complementarySkills: string[]
}

export interface TeamResult {
  teamId: string
  members: TeamMember[]
  diversityScore: number
  coverageScore: number
  coverage: Record<string, boolean>
  reason: string
}

export interface IdeaMatch {
  id: string
  title: string
  description: string
  similarity: number
  source: string
}

export interface IdeaCheckResult {
  ideaId: string
  noveltyScore: number
  matches: IdeaMatch[]
  status: 'novel' | 'worth_reviewing' | 'needs_review' | 'confirmed_overlap' | 'dismissed'
  embeddingMode: 'sentence-bert' | 'tfidf-fallback'
  searchBackend: 'faiss'
}

export interface HistoryItem {
  id: string
  title: string
  date: string
  noveltyScore: number
  status: string
  topSimilarity: number
}

export interface ReviewQueueItem {
  reviewId: string
  ideaId: string
  title: string
  description: string
  topSimilarity: number
  matches: IdeaMatch[]
  submittedAt: string
}

export interface SavedOpportunity extends Opportunity {
  savedAt: string
}

export type ApplicationStatus =
  | 'wishlist' | 'saved' | 'planning' | 'applying' | 'applied'
  | 'shortlisted' | 'interview' | 'selected' | 'rejected' | 'withdrawn'

export interface Application {
  id: string
  status: ApplicationStatus
  notes: string
  nextAction?: string | null
  reminderAt?: string | null
  createdAt: string
  updatedAt: string
  opportunityId: string
  title?: string
  organization?: string
  domain?: string
  externalUrl?: string
  deadline?: string | null
  urgency?: string
}

export interface ApplicationEvent {
  kind: string
  detail: string
  createdAt: string
}

export interface NotificationItem {
  id: string
  kind: string
  title: string
  body: string
  link?: string | null
  read: boolean
  createdAt: string
}

export interface SavedSearch {
  id: string
  name: string
  query: string
  domain?: string | null
  skill?: string | null
  minFit?: number | null
  enabled: boolean
  createdAt: string
}

export interface ActivityItem {
  id: string
  kind: string
  title: string
  link?: string | null
  createdAt: string
}

export interface OrganizationSummary {
  name: string
  opportunityCount: number
}

export interface OrganizationDetail extends OrganizationSummary {
  domains: string[]
  opportunities: Opportunity[]
}

export interface NextBestAction {
  priority: number
  title: string
  detail: string
  action: string
  link: string
}

export interface WhyNotBlocker {
  kind: string
  detail: string
}

export interface WhyNotResult {
  fitScore: number
  blockers: WhyNotBlocker[]
  suggestedActions: string[]
}

export interface SkillGapItem {
  skill: string
  unlocksCount: number
  example: string
}

export interface ApplicationInsight {
  applicationId: string
  title?: string
  kind: 'stalled' | 'urgent'
  detail: string
}
