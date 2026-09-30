import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft, ExternalLink, Check, Triangle, ClipboardList, Users, ShieldCheck, AlertTriangle, CalendarPlus } from 'lucide-react'
import { opportunityService, applicationService, intelligenceService, calendarService } from '../lib/services'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { SkeletonCard } from '../components/ui/primitives'
import { SaveButton } from '../components/opportunities/SaveButton'

export function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const detailQ = useQuery({ queryKey: ['opportunity', id], queryFn: () => opportunityService.detail(id!), enabled: !!id })
  const recsQ = useQuery({ queryKey: ['recommend', 50], queryFn: () => opportunityService.recommend(50) })
  const appsQ = useQuery({ queryKey: ['applications'], queryFn: applicationService.list })

  const trackMutation = useMutation({
    mutationFn: () => applicationService.create(id!, 'wishlist'),
    onSuccess: () => {
      toast.success('Added to your application tracker')
      qc.invalidateQueries({ queryKey: ['applications'] })
      qc.invalidateQueries({ queryKey: ['activity'] })
    },
  })

  if (detailQ.isLoading) return <SkeletonCard />
  if (!detailQ.data) return null

  const opp = detailQ.data
  const rec = recsQ.data?.items.find((r) => r.id === id)
  const existingApp = appsQ.data?.items.find((a) => a.opportunityId === id)

  return (
    <div>
      <Link to="/opportunities" className="text-sm text-muted flex items-center gap-1 mb-4"><ArrowLeft size={14} /> Back to opportunities</Link>

      <Card variant="elevated" className="p-6 mb-4">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h1 className="text-xl font-semibold">{opp.title}</h1>
            <p className="text-sm text-muted mt-1">{opp.organization} · {opp.domain} · {opp.format}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {rec && <div className="text-2xl font-semibold text-accent-500">{rec.fitScore}%</div>}
            <SaveButton opportunityId={opp.id} size={18} />
          </div>
        </div>
        <p className="text-sm mt-4 leading-relaxed">{opp.description}</p>
        <dl className="grid grid-cols-2 gap-3 text-sm mt-5">
          <div><dt className="text-xs text-muted">Deadline</dt><dd>{opp.deadline || 'TBD'}</dd></div>
          <div><dt className="text-xs text-muted">Difficulty</dt><dd className="capitalize">{opp.difficulty}</dd></div>
          <div><dt className="text-xs text-muted">Source</dt><dd>{opp.source}</dd></div>
          <div><dt className="text-xs text-muted">Format</dt><dd className="capitalize">{opp.format}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-1.5 mt-4">
          {opp.skills.map((s) => <span key={s} className="text-xs px-2.5 py-1 rounded-full surface capitalize">{s}</span>)}
        </div>
      </Card>

      {rec && (
        <Card variant="elevated" className="p-6 mb-4">
          <h2 className="font-medium mb-3">Why NIRMAAN recommends this</h2>
          <p className="text-sm text-muted mb-4">{rec.reason}</p>
          <div className="space-y-2">
            {rec.matchedSkills.map((s) => (
              <div key={s} className="flex items-center gap-2 text-sm text-success-500"><Check size={14} /> {s}</div>
            ))}
            {rec.missingSkills.map((s) => (
              <div key={s} className="flex items-center gap-2 text-sm text-warning-500"><Triangle size={14} /> {s} — not yet on your profile</div>
            ))}
          </div>
        </Card>
      )}

      {rec && rec.fitScore < 50 && <WhyNotSection opportunityId={opp.id} />}

      <div className="flex flex-wrap gap-3">
        {opp.deadline && (
          <Button
            variant="secondary"
            onClick={() => calendarService.downloadIcs(opp.id, `${opp.title.slice(0, 40)}-deadline.ics`).catch(() => toast.error('Could not export deadline'))}
          >
            <CalendarPlus size={14} /> Add deadline to calendar
          </Button>
        )}        {existingApp ? (
          <Link to="/applications">
            <Button variant="secondary"><ClipboardList size={14} /> Tracking as "{existingApp.status}"</Button>
          </Link>
        ) : (
          <Button onClick={() => trackMutation.mutate()} loading={trackMutation.isPending}>
            <ClipboardList size={14} /> Add to Applications
          </Button>
        )}
        <Link to={`/team-builder?opportunityId=${opp.id}&skills=${encodeURIComponent(opp.skills.join(','))}&teamSize=${opp.maxTeamSize || 4}`}>
          <Button variant="secondary"><Users size={14} /> Build team for this</Button>
        </Link>
        <Link to={`/originality?opportunityId=${opp.id}&domain=${encodeURIComponent(opp.domain)}`}>
          <Button variant="secondary"><ShieldCheck size={14} /> Validate idea for this</Button>
        </Link>
        <a href={opp.externalUrl} target="_blank" rel="noreferrer">
          <Button variant="ghost">Open original opportunity <ExternalLink size={14} /></Button>
        </a>
      </div>
    </div>
  )
}

function WhyNotSection({ opportunityId }: { opportunityId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['why-not', opportunityId],
    queryFn: () => intelligenceService.whyNot(opportunityId),
  })

  if (isLoading || !data || data.blockers.length === 0) return null

  return (
    <Card variant="surface" className="p-6 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={16} className="text-warning-500" />
        <h2 className="font-medium">Why this may not be a strong match yet</h2>
      </div>
      <div className="space-y-2 mb-4">
        {data.blockers.map((b) => (
          <p key={b.kind} className="text-sm text-muted">{b.detail}</p>
        ))}
      </div>
      {data.suggestedActions.length > 0 && (
        <>
          <p className="text-xs font-medium text-muted mb-1.5">How to improve your fit</p>
          <ul className="text-sm space-y-1">
            {data.suggestedActions.map((a) => <li key={a} className="text-muted">→ {a}</li>)}
          </ul>
        </>
      )}
    </Card>
  )
}
