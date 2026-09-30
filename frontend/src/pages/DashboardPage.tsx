import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Users, ShieldCheck, ChevronRight, Sparkles, Compass, ArrowRight, ClipboardList, Zap } from 'lucide-react'
import { profileService, opportunityService, originalityService, applicationService, intelligenceService } from '../lib/services'
import { SkeletonDashboard, EmptyState, ScoreRing, Badge } from '../components/ui/primitives'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { OpportunityCard } from '../components/opportunities/OpportunityCard'

const WORKFLOW = [
  { label: 'Discover', to: '/opportunities', icon: Compass },
  { label: 'Build', to: '/team-builder', icon: Users },
  { label: 'Validate', to: '/originality', icon: ShieldCheck },
]
const ACTIVE_STATUSES = ['applying', 'applied', 'shortlisted', 'interview']

export function DashboardPage() {
  const profileQ = useQuery({ queryKey: ['profile'], queryFn: profileService.get })
  const recsQ = useQuery({ queryKey: ['recommend', 4], queryFn: () => opportunityService.recommend(4) })
  const historyQ = useQuery({ queryKey: ['history'], queryFn: originalityService.history })
  const appsQ = useQuery({ queryKey: ['applications'], queryFn: applicationService.list })
  const nbaQ = useQuery({ queryKey: ['next-best-action'], queryFn: intelligenceService.nextBestAction })
  const skillGapsQ = useQuery({ queryKey: ['skill-gaps'], queryFn: intelligenceService.skillGaps })

  if (profileQ.isLoading || recsQ.isLoading || historyQ.isLoading) return <SkeletonDashboard />
  if (!profileQ.data) return null

  const profile = profileQ.data
  const recs = recsQ.data?.items ?? []
  const history = historyQ.data?.items ?? []
  const applications = appsQ.data?.items ?? []
  const best = recs[0]
  const rest = recs.slice(1)
  const closingSoon = recs.filter((r) => r.urgency === 'critical' || r.urgency === 'soon')
  const activeApplications = applications.filter((a) => ACTIVE_STATUSES.includes(a.status))

  return (
    <div>
      <h1 className="text-2xl font-semibold">Good day, {profile.name.split(' ')[0]}</h1>
      <p className="text-muted text-sm mb-6">Your innovation workspace is ready.</p>

      {nbaQ.data?.action && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Card variant="highlight" className="p-4 mb-6 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-accent-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <Zap size={15} className="text-accent-500" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-accent-500 font-medium mb-0.5">Next best action</p>
                <p className="text-sm font-medium">{nbaQ.data.action.title}</p>
                <p className="text-xs text-muted mt-0.5">{nbaQ.data.action.detail}</p>
              </div>
            </div>
            <Link to={nbaQ.data.action.link} className="shrink-0"><Button size="sm">{nbaQ.data.action.action}</Button></Link>
          </Card>
        </motion.div>
      )}

      {/* Innovation workflow — clickable stages */}
      <div className="flex items-center gap-1.5 mb-8 overflow-x-auto pb-1">
        {WORKFLOW.map(({ label, to, icon: Icon }, i) => (
          <div key={to} className="flex items-center gap-1.5 shrink-0">
            <Link to={to} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs surface-interactive text-muted hover:text-[var(--text)]">
              <Icon size={12} /> {label}
            </Link>
            {i < WORKFLOW.length - 1 && <ArrowRight size={12} className="text-muted/40 shrink-0" />}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Kpi label="Profile" value={profile.profile_complete ? 'Complete' : 'Incomplete'} delay={0} />
        <Kpi label="Recommended" value={String(recs.length)} delay={0.05} />
        <Kpi label="Ideas checked" value={String(history.length)} delay={0.1} />
        <Kpi label="Skills logged" value={String(profile.skills.length)} delay={0.15} />
      </div>

      {!profile.profile_complete && (
        <Card variant="highlight" className="p-4 mb-6 flex items-center justify-between">
          <div className="text-sm">
            <p className="font-medium">Your profile needs a little more signal</p>
            <p className="text-muted text-xs mt-0.5">Add skills and interests to unlock accurate recommendations.</p>
          </div>
          <Link to="/profile"><Button size="sm">Complete profile</Button></Link>
        </Card>
      )}

      {/* Best match — visually dominant, real backend fit score */}
      {best && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <Card variant="highlight" className="p-6 mb-6">
            <p className="text-[11px] font-medium text-accent-500 tracking-wide mb-4">YOUR BEST MATCH</p>
            <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
              <ScoreRing value={best.fitScore} size={88} label="fit" />
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-medium">{best.title}</h2>
                <p className="text-sm text-muted mt-0.5">{best.organization} · {best.domain} · deadline {best.deadline || 'TBD'}</p>
                <p className="text-xs text-muted mt-2 max-w-md">{best.reason}</p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {best.matchedSkills.map((s) => <Badge key={s} tone="success">✓ {s}</Badge>)}
                  {best.missingSkills.slice(0, 2).map((s) => <Badge key={s} tone="warning">△ {s}</Badge>)}
                </div>
                <Link to={`/opportunities/${best.id}`}>
                  <Button size="sm" className="mt-4">View opportunity <ArrowRight size={14} /></Button>
                </Link>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {rest.length > 0 && (
        <Card variant="elevated" className="p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">More matched opportunities</h2>
            <Link to="/opportunities" className="text-xs text-accent-500 flex items-center gap-1">View all <ChevronRight size={12} /></Link>
          </div>
          <div className="space-y-3">{rest.map((o) => <OpportunityCard key={o.id} opp={o} />)}</div>
        </Card>
      )}

      {recs.length === 0 && (
        <Card variant="elevated" className="p-5 mb-6">
          <EmptyState
            icon={Sparkles}
            title="Your profile needs a little more signal"
            description="Add skills and interests to improve matching."
            action={<Link to="/profile"><Button size="sm">Complete profile</Button></Link>}
          />
        </Card>
      )}

      {(skillGapsQ.data?.items.length ?? 0) > 0 && (
        <Card variant="elevated" className="p-5 mb-6">
          <h2 className="font-medium mb-1">Your biggest skill gaps</h2>
          <p className="text-xs text-muted mb-3">Skills missing across your current recommendations — adding one for real would unlock these opportunities.</p>
          <div className="space-y-2">
            {skillGapsQ.data!.items.slice(0, 4).map((g) => (
              <div key={g.skill} className="flex items-center justify-between text-sm">
                <span className="capitalize">{g.skill}</span>
                <span className="text-xs text-muted">unlocks {g.unlocksCount} opportunit{g.unlocksCount === 1 ? 'y' : 'ies'}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {closingSoon.length > 0 && (
        <Card variant="elevated" className="p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">Closing soon</h2>
            <Badge tone="warning">{closingSoon.length} opportunit{closingSoon.length === 1 ? 'y' : 'ies'}</Badge>
          </div>
          <div className="space-y-3">{closingSoon.slice(0, 3).map((o) => <OpportunityCard key={o.id} opp={o} />)}</div>
        </Card>
      )}

      {activeApplications.length > 0 && (
        <Card variant="elevated" className="p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">Continue your applications</h2>
            <Link to="/applications" className="text-xs text-accent-500 flex items-center gap-1">View all <ChevronRight size={12} /></Link>
          </div>
          <div className="space-y-2">
            {activeApplications.slice(0, 3).map((a) => (
              <Link key={a.id} to={`/opportunities/${a.opportunityId}`} className="flex items-center justify-between p-3 rounded-lg surface-interactive text-sm">
                <span className="min-w-0 truncate">{a.title}</span>
                <Badge tone="accent">{a.status}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card variant="interactive" className="p-5">
          <ClipboardList size={20} className="text-accent-500 mb-2" />
          <h2 className="font-medium mb-1">Track your applications</h2>
          <p className="text-sm text-muted mb-3">Kanban pipeline from wishlist to selected.</p>
          <Link to="/applications"><Button size="sm">Open Applications</Button></Link>
        </Card>
        <Card variant="interactive" className="p-5">
          <Users size={20} className="text-accent-500 mb-2" />
          <h2 className="font-medium mb-1">Build your ideal team</h2>
          <p className="text-sm text-muted mb-3">Skill-complementary teammates, not just your friend circle.</p>
          <Link to="/team-builder"><Button size="sm">Find teammates</Button></Link>
        </Card>
        <Card variant="interactive" className="p-5">
          <ShieldCheck size={20} className="text-accent-500 mb-2" />
          <h2 className="font-medium mb-1">Have an idea?</h2>
          <p className="text-sm text-muted mb-3">Check it against prior work before investing weeks.</p>
          <Link to="/originality"><Button size="sm">Check originality</Button></Link>
        </Card>
      </div>
    </div>
  )
}

function Kpi({ label, value, delay }: { label: string; value: string; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay }}>
      <Card variant="elevated" className="p-4">
        <div className="text-xs text-muted">{label}</div>
        <div className="text-xl font-semibold mt-1">{value}</div>
      </Card>
    </motion.div>
  )
}
