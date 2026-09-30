// Types mirror the FastAPI response models (camelCase on the wire). Anything nullable in the API is nullable here:
// "unknown" is a real state in NIRMAAN and is never replaced by a made-up default.

export type Role = 'student' | 'reviewer' | 'admin'
export type Level = 'beginner' | 'intermediate' | 'advanced'
export type Format = 'online' | 'offline' | 'hybrid'
export type WorkMode = 'remote' | 'onsite' | 'hybrid'
export type Participation = 'individual' | 'team'
export type Confidence = 'high' | 'medium' | 'low'
export type Urgency = 'expired' | 'critical' | 'soon' | 'open' | 'unknown'

export interface Me {
  id: string; email: string; fullName: string; role: Role
  isReviewer: boolean; isAdmin: boolean; onboardingCompleted: boolean
}

export interface AuthConfig { emailPassword: boolean; google: boolean; emailConfirmationRequired: boolean; verified: boolean }

export interface Completeness { complete: boolean; missing: string[]; optionalMissing: string[]; percent: number }
export interface InferredSkill { name: string; source: string; confidence: number }
export interface ProfileItem { id: string; kind: 'education' | 'project' | 'certification' | 'experience' | 'achievement'; text: string; source: string }
export interface Profile {
  id: string; email: string; fullName: string; role: Role; year: string | null; branch: string | null
  experienceLevel: Level; availabilityHrs: number; openToTeam: boolean; onboardingCompleted: boolean
  participationPref: 'individual' | 'team' | 'either'; location: string | null
  educationLevel: 'high_school' | 'undergraduate' | 'postgraduate' | 'phd' | 'other' | null; preferredFormat: Format | null
  skills: string[]; inferredSkills: InferredSkill[]; interests: string[]
  skillEvidence: { skill: string; source: string; evidence: string; confidence: number }[]
  items: ProfileItem[]; links: Record<string, string>; completeness: Completeness; createdAt: string
}
export type ProfileUpdate = Partial<Pick<Profile, 'fullName' | 'year' | 'branch' | 'experienceLevel' | 'availabilityHrs' | 'openToTeam' | 'participationPref' | 'location' | 'educationLevel' | 'preferredFormat' | 'skills' | 'interests' | 'onboardingCompleted'>>
export interface VocabItem { slug: string; name: string }

// ── Opportunities ───────────────────────────────────────────────────────────────────────────
export interface FitComponent { key: string; label: string; weight: number; score: number | null; detail: string; known: boolean }
export interface FitSummary { overall: number; confidence: Confidence; matchedSkills: string[]; missingSkills: string[]; reasons: string[]; concerns: string[]; expired: boolean }
export interface FitDetail extends FitSummary { opportunityId: string; components: FitComponent[]; preferredMatched: string[]; preferredMissing: string[] }
export interface Blocker { kind: string; severity: 'blocker' | 'warning' | 'info'; title: string; detail: string; fix: string; impact: number }
export interface WhyNot { fitScore: number; blockers: Blocker[]; mainBlockers: string[]; verify: string[] }

export interface OpportunityCardData {
  id: string; title: string; organization: string; organizationSlug: string; category: string | null; subcategory: string | null
  domain: string | null; domainLabel: string | null; tags: string[]; requiredSkills: string[]; preferredSkills: string[]
  difficulty: Level | null; format: Format | null; workMode: WorkMode | null; participation: Participation | null
  minTeamSize: number | null; maxTeamSize: number | null; deadline: string | null; daysRemaining: number | null; urgency: Urgency; isExpired: boolean
  location: string | null; prizeText: string | null; stipendAmount: number | null; stipendCurrency: string | null; salaryText: string | null; certificate: boolean | null
  source: string; sourceType: string; isDemo: boolean; verificationStatus: string; freshnessStatus: string; lastVerifiedAt: string | null
  officialUrl: string | null; saved: boolean; applicationStatus: ApplicationStatus | null; fit: FitSummary | null
}
export interface OpportunityDetailData extends OpportunityCardData {
  description: string; eligibility: string | null; educationRequirements: string | null; experienceRequirements: string | null
  registrationStart: string | null; eventStart: string | null; eventEnd: string | null; applicationUrl: string | null; lastSeenAt: string | null
  sources: { name: string; kind: string; url: string | null; lastSeenAt: string }[]; fitDetail: FitDetail | null; whyNot: WhyNot | null
}
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number; pages: number }
export interface OpportunityPage extends Page<OpportunityCardData> { fitScanTruncated: boolean; applied: Record<string, unknown>; sort: string; minFit: number | null }
export interface FacetOption { value: string; count: number; label?: string }
export interface Facets { category: FacetOption[]; difficulty: FacetOption[]; format: FacetOption[]; participation: FacetOption[]; workMode: FacetOption[]; freshness: FacetOption[]; domain: FacetOption[]; skills: FacetOption[]; verified: number }
export interface Recommendations { items: OpportunityCardData[]; total: number; basedOn: { confirmedSkills: number; interests: number; behaviouralEvents: number } }
export interface CompareResult { items: OpportunityCardData[]; strongest: { id: string; title: string; fit: number; reason: string } | null }

export interface OpportunityFilters {
  q?: string; category: string[]; domain: string[]; skill: string[]; difficulty: string[]; format: string[]; participation: string[]
  workMode: string[]; freshness: string[]; teamSize?: number; location?: string; eligibility?: string; deadlineWithin?: number
  verified?: boolean; includeExpired?: boolean; minFit?: number; sort: 'relevance' | 'deadline' | 'newest' | 'fit'; page: number
}

// ── Applications ────────────────────────────────────────────────────────────────────────────
export type ApplicationStatus = 'wishlist' | 'saved' | 'planning' | 'applying' | 'applied' | 'shortlisted' | 'interview' | 'selected' | 'rejected' | 'withdrawn'
export const APPLICATION_STATUSES: ApplicationStatus[] = ['wishlist', 'saved', 'planning', 'applying', 'applied', 'shortlisted', 'interview', 'selected', 'rejected', 'withdrawn']
export interface Application {
  id: string; status: ApplicationStatus; notes: string; nextAction: string | null; reminderAt: string | null; createdAt: string; updatedAt: string
  opportunity: { id: string; title: string; organization: string; category: string | null; deadline: string | null; daysRemaining: number | null; urgency: Urgency; isExpired: boolean; isDemo: boolean }
  timeline?: { id: string; kind: string; detail: string; createdAt: string }[]
}
export interface ApplicationList { items: Application[]; total: number; counts: Record<ApplicationStatus, number> }
export interface ApplicationInsight { applicationId: string; title: string; kind: 'stalled' | 'urgent'; detail: string }

// ── Alerts / notifications / activity ───────────────────────────────────────────────────────
export interface Alert {
  id: string; name: string; query: string; category: string | null; domain: string | null; skill: string | null; location: string | null
  workMode: WorkMode | null; participation: Participation | null; deadlineWithinDays: number | null; minFit: number | null
  enabled: boolean; lastEvaluatedAt: string | null; createdAt: string; hitCount: number
}
export interface AlertInput { name: string; query?: string; category?: string | null; domain?: string | null; skill?: string | null; location?: string | null; workMode?: WorkMode | null; participation?: Participation | null; deadlineWithinDays?: number | null; minFit?: number | null; enabled?: boolean }
export interface AlertEvaluation { alertId: string; candidates: number; matches: { opportunityId: string; title: string; organization: string; fit: number; deadline: string | null }[]; notificationsCreated: number }
export interface AlertHit { opportunityId: string; title: string; organization: string; deadline: string | null; fit: number | null; matchedAt: string }
export interface NotificationItem { id: string; kind: string; title: string; body: string; link: string | null; read: boolean; createdAt: string }
export interface NotificationPage { items: NotificationItem[]; total: number; unread: number; page: number; pageSize: number }
export interface NotificationPrefs { highFit: boolean; smartAlert: boolean; deadline: boolean; applicationUpdate: boolean; teamEvent: boolean; originalityReview: boolean; minFitForNotify: number }
export interface ActivityItem { id: string; kind: string; title: string; link: string | null; createdAt: string }
export interface Signals {
  eventCounts: { eventType: string; n: number }[]; totalEvents: number; usedForRanking: number; active: boolean; minEvents: number
  topCategories: { name: string; weight: number }[]; topDomains: { name: string; weight: number }[]; topSkills: { name: string; weight: number }[]
  dismissed: number; halfLifeDays: number; explanation: string
}

// ── Dashboard / intelligence ────────────────────────────────────────────────────────────────
export interface NextAction { kind: string; priority: number; title: string; reason: string; cta: { label: string; href: string }; evidence: Record<string, unknown> }
export interface NextBestActionResult { action: NextAction | null; alternatives: NextAction[]; message: string | null }
export interface SkillGap {
  skill: string; unlocks: number; highFitUnlocks: number; teamRole: string; action: string; inferred: boolean
  evidence: { source: string; evidence: string }[]; opportunities: { id: string; title: string; fitNow: number; fitWithSkill: number }[]
}
export interface Dashboard {
  greetingName: string | null; profile: { completeness: Completeness; onboardingCompleted: boolean }
  nextBestAction: NextBestActionResult; recommendations: OpportunityCardData[]
  basedOn: { confirmedSkills: number; interests: number; behaviouralEvents: number }
  deadlines: { opportunityId: string; title: string; organization: string; deadline: string; daysRemaining: number | null; urgency: Urgency; status: string | null; saved: boolean; isDemo: boolean }[]
  skillGaps: SkillGap[]; pipeline: { counts: Record<ApplicationStatus, number>; total: number }
  teams: { id: string; name: string | null; status: string; opportunity: string | null }[]; pendingInvitations: number
  ideas: { id: string; title: string; status: string; topSimilarity: number | null; createdAt: string }[]; insights: ApplicationInsight[]
  totals: { saved: number; applications: number; teams: number; ideas: number; unreadNotifications: number; opportunitiesScored: number; opportunitiesAbove70: number }
}

// ── Organizations ───────────────────────────────────────────────────────────────────────────
export interface OrganizationSummary { slug: string; name: string; website: string | null; openCount: number; categories: string[]; isDemo: boolean }
export interface OrganizationDetail { slug: string; name: string; website: string | null; isDemo: boolean; openCount: number; opportunities: OpportunityCardData[]; note: string }

// ── Teams ───────────────────────────────────────────────────────────────────────────────────
export interface TeamMemberSuggestion {
  id: string; name: string; role: string; skills: string[]; contributedSkills: string[]; complementarySkills: string[]; overlapSkills: string[]
  compatibility: { score: number | null; parts: Record<string, number | null> }; why: string; isYou?: boolean; marginalScore?: number; rank?: number
}
export interface TeamMetrics { skillCoverage: number; roleDiversity: number; complementarity: number; redundancy: number; score: number; roles: string[]; formula: string; note: string }
export interface TeamSuggestion {
  context: { opportunity: { id: string; title: string; organization: string; isDemo: boolean } | null; required: string[]; preferred: string[]; minTeam: number | null; maxTeam: number | null }
  members: TeamMemberSuggestion[]; candidates: TeamMemberSuggestion[]; metrics: TeamMetrics; coverage: Record<string, boolean>
  coverageBefore: { covered: string[]; missing: string[] }; uncovered: string[]; summary: string; requestedSize: number; poolSize: number
}
export interface TeamRecord {
  id: string; name: string | null; note: string | null; status: string; isOwner: boolean; myStatus: string | null; coverage: number; diversity: number
  requestedSize: number; createdAt: string; opportunity: { id: string; title: string } | null; requiredSkills: string[]; metrics: TeamMetrics | null
  members: { id: string; name: string; role: string | null; status: string; skills: string[]; isYou: boolean }[]
}

// ── Originality / review ────────────────────────────────────────────────────────────────────
export interface OverlapDims { semantic: number; title: number | null; sameDomain: boolean | null; sharedTerms: string[] }
export interface IdeaMatch { id: string; title: string; description: string; source: string | null; similarity: number; overlap: OverlapDims }
export interface IdeaResult {
  id: string; title: string; description: string; domain: string | null; status: string; createdAt: string; topSimilarity: number | null; confidence: Confidence | null
  verdict: { level: 'no_significant_match' | 'related_work' | 'high_overlap' | 'no_corpus'; label: string; message: string; needsReview: boolean }
  method: { description: string; model: string; search: string; corpusSize: number; thresholds: { review: number; related: number } }
  disclaimer: string; peerOverlapsExist: boolean; matches: IdeaMatch[]; opportunity: { id: string; title: string } | null
  review: { state: string; decidedAt: string | null; decisions: { decision: string; note: string | null; at: string }[] } | null
}
export interface IdeaHistoryItem { id: string; title: string; status: string; topSimilarity: number | null; level: string | null; createdAt: string; reviewState: string | null }
export type ReviewDecisionKind = 'approve' | 'request_changes' | 'escalate' | 'reject'
export interface ReviewQueueItem { reviewId: string; state: 'pending' | 'escalated'; queuedAt: string; ideaId: string; title: string; description: string; topSimilarity: number | null; level: string | null; confidence: Confidence | null; isMine: boolean; decisions: number }
export interface ReviewQueue { items: ReviewQueueItem[]; total: number; counts: Record<string, number>; page: number; pageSize: number }
export interface ReviewDetail {
  id: string; state: string; queuedAt: string; isMine: boolean; canDecide: boolean
  idea: { id: string; title: string; description: string; domain: string | null; status: string; submittedAt: string; opportunity: string | null }
  similarity: { top: number | null; confidence: Confidence | null; level: string | null; message: string | null; method: string | null; corpusSize: number | null; thresholds: { review: number; related: number } | null; disclaimer: string | null }
  matches: { id: string; kind: string; title: string; description: string; source: string | null; similarity: number; overlap: Partial<OverlapDims>; shownToSubmitter: boolean }[]
  submitterHistory: Record<string, number>; decisions: { decision: string; note: string | null; at: string; reviewer: string }[]
}

// ── Integrations / resume / admin ───────────────────────────────────────────────────────────
export interface IntegrationStatus { enabled: boolean; reason: string | null; calendar: { connected: boolean; scopes: string[]; connectedAt: string | null }; gmail: { connected: boolean; scopes: string[]; connectedAt: string | null } }
export interface ResumeExtraction {
  method: string; willChange: string
  extracted: { name: string | null; email: string | null; links: string[]; education: string[]; projects: string[]; certifications: string[]; experience: string[]; achievements: string[]
    skills: { name: string; evidence: string }[]; sectionsFound: string[]; charactersRead: number; items: Record<string, string[]> }
  diff: { newSkills: { name: string; evidence: string }[]; alreadyConfirmed: string[]; nameDiffers: boolean; currentName: string; newLinks: string[] }
}
export interface AdminUser { id: string; email: string; fullName: string; role: Role; onboardingCompleted: boolean; createdAt: string }
export interface AuditEntry { id: string; action: string; entity: string; entityId: string | null; detail: Record<string, unknown>; at: string; actor: string | null }
export interface IngestionOverview {
  sources: { key: string; name: string; kind: string; enabled: boolean; robotsReviewedAt: string | null; lastRunAt: string | null }[]
  runs: { id: string; source: string; status: string; startedAt: string; finishedAt: string | null; fetched: number; inserted: number; updated: number; duplicates: number; rejected: number; error: string | null }[]
}
