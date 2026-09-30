import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, CalendarPlus, ExternalLink, EyeOff, GitCompare, ShieldCheck, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge, ErrorState, Skeleton } from '../components/ui/primitives'
import { DemoBadge, Dialog, Notice, Select } from '../components/ui/kit'
import { FitPanel, WhyNotPanel } from '../components/opportunities/FitPanels'
import { SaveButton } from '../components/opportunities/SaveButton'
import { useAuth } from '../context/AuthContext'
import { applicationService, integrationService, opportunityService } from '../lib/services'
import { deadlineLabel, formatDate, money, skillLabel, titleCase, urgencyTone } from '../lib/format'
import type { ApiError } from '../lib/api'
import { APPLICATION_STATUSES, type ApplicationStatus } from '../types'

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt><dd className="text-sm mt-0.5">{children}</dd></div>
}

export function OpportunityDetailPage() {
  const { id = '' } = useParams(); const nav = useNavigate(); const qc = useQueryClient(); const { me } = useAuth()
  const [calOpen, setCalOpen] = useState(false)
  const q = useQuery({ queryKey: ['opportunity', id], queryFn: () => opportunityService.detail(id), retry: false })
  const integ = useQuery({ queryKey: ['integrations'], queryFn: integrationService.status, staleTime: 60_000 })
  const apps = useQuery({ queryKey: ['applications'], queryFn: applicationService.list })
  const o = q.data
  const app = apps.data?.items.find((a) => a.opportunity.id === id)

  useEffect(() => { if (o) opportunityService.event(id, 'view').catch(() => undefined) }, [id, !!o]) // eslint-disable-line react-hooks/exhaustive-deps
  const inval = () => { for (const k of ['applications', 'opportunity', 'opportunities', 'dashboard', 'activity']) qc.invalidateQueries({ queryKey: [k] }) }
  const track = useMutation({ mutationFn: (s: ApplicationStatus) => (app ? applicationService.update(app.id, { status: s }) : applicationService.create(id, s)), onSuccess: () => { toast.success(app ? 'Status updated' : 'Added to your tracker'); inval() }, onError: (e: ApiError) => toast.error(e.message) })
  const dismiss = useMutation({ mutationFn: () => opportunityService.event(id, 'dismiss'), onSuccess: () => { toast.success("Hidden from your recommendations. You can reset this in Settings."); for (const k of ['opportunities', 'recommendations', 'dashboard']) qc.invalidateQueries({ queryKey: [k] }); nav('/opportunities') }, onError: (e: ApiError) => toast.error(e.message) })
  const addCal = useMutation({ mutationFn: () => integrationService.addToCalendar(id), onSuccess: (r) => { toast.success('Added to Google Calendar'); setCalOpen(false); if (r.htmlLink) window.open(r.htmlLink, '_blank', 'noopener,noreferrer') }, onError: (e: ApiError) => toast.error(e.message) })
  const ics = useMutation({ mutationFn: () => opportunityService.downloadIcs(id), onError: (e: ApiError) => toast.error(e.message) })

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>
  if (q.isError || !o) return <ErrorState message={(q.error as ApiError)?.status === 404 ? 'This opportunity no longer exists or the link is wrong.' : (q.error as Error)?.message} onRetry={(q.error as ApiError)?.status === 404 ? undefined : () => q.refetch()} />

  const matched = new Set(o.fit?.matchedSkills ?? []); const pMatched = new Set(o.fitDetail?.preferredMatched ?? [])
  const pay = money(o.stipendAmount, o.stipendCurrency)
  const external = o.applicationUrl || o.officialUrl
  const calConnected = integ.data?.calendar.connected

  return (
    <article>
      <Link to="/opportunities" className="text-xs text-muted hover:text-[var(--text)] focus-ring rounded">← All opportunities</Link>
      <header className="mt-3 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-2">{o.category && <Badge tone="accent">{o.category}</Badge>}{o.difficulty && <Badge>{titleCase(o.difficulty)}</Badge>}{o.isDemo && <DemoBadge />}
            {!o.isDemo && <Badge tone={o.verificationStatus === 'verified' ? 'success' : 'neutral'}>{o.verificationStatus === 'verified' ? 'Verified source' : 'Unverified'}</Badge>}</div>
          <h1 className="text-2xl font-semibold tracking-tight">{o.title}</h1>
          <Link to={`/organizations/${o.organizationSlug}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-[var(--text)] mt-1 focus-ring rounded"><Building2 size={14} aria-hidden /> {o.organization}</Link>
        </div>
        <div className="flex flex-wrap items-center gap-2"><SaveButton id={o.id} saved={o.saved} />
          {external && !o.isExpired && <a href={external} target="_blank" rel="noopener noreferrer nofollow"><Button variant="secondary"><ExternalLink size={14} /> Official page</Button></a>}</div>
      </header>

      {o.isDemo && <div className="mb-6"><Notice title="Demo listing">This is sample data for demonstrating NIRMAAN — the event, deadline and organization details are illustrative and there is no live posting to apply to.</Notice></div>}
      {o.isExpired && <div className="mb-6"><Notice tone="danger" title="Closed">The registration deadline passed on {formatDate(o.deadline)}.</Notice></div>}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6 min-w-0">
          {o.fitDetail && <FitPanel fit={o.fitDetail} />}
          {o.whyNot && (o.whyNot.blockers.length > 0 || o.whyNot.verify.length > 0) && <WhyNotPanel data={o.whyNot} />}

          <Card className="p-5"><h2 className="text-sm font-semibold mb-2">About</h2>
            <p className="text-sm leading-relaxed whitespace-pre-line">{o.description || 'No description was provided.'}</p>
            <dl className="grid sm:grid-cols-2 gap-4 mt-5">
              <Fact label="Eligibility">{o.eligibility ?? 'Not listed'}</Fact><Fact label="Education">{o.educationRequirements ?? 'Not listed'}</Fact><Fact label="Experience">{o.experienceRequirements ?? 'Not listed'}</Fact>
              <Fact label="Format">{[o.format && titleCase(o.format), o.workMode && titleCase(o.workMode)].filter(Boolean).join(' · ') || 'Not listed'}</Fact><Fact label="Location">{o.location ?? 'Not listed'}</Fact>
              <Fact label="Participation">{o.participation ? `${titleCase(o.participation)}${o.minTeamSize ? ` · ${o.minTeamSize}${o.maxTeamSize ? `–${o.maxTeamSize}` : '+'} people` : ''}` : 'Not listed'}</Fact>
              <Fact label="Prize / pay">{[o.prizeText, pay && `${pay}/month`, o.salaryText].filter(Boolean).join(' · ') || 'Not listed'}</Fact><Fact label="Certificate">{o.certificate === null ? 'Not listed' : o.certificate ? 'Yes' : 'No'}</Fact>
            </dl></Card>

          <Card className="p-5"><h2 className="text-sm font-semibold mb-3">Skills</h2>
            {(o.requiredSkills.length + o.preferredSkills.length) === 0 ? <p className="text-sm text-muted">This listing doesn't state any skills.</p> : (<div className="space-y-3">
              {o.requiredSkills.length > 0 && <div><p className="text-xs text-muted mb-1.5">Required</p><div className="flex flex-wrap gap-1.5">{o.requiredSkills.map((s) => <span key={s} className={`text-xs px-2.5 py-1 rounded-full border ${matched.has(s) ? 'border-success-500/40 bg-success-500/10 text-success-500' : 'border-danger-500/30 bg-danger-500/5 text-danger-500'}`}>{matched.has(s) ? '✓' : '✗'} {skillLabel(s)}</span>)}</div></div>}
              {o.preferredSkills.length > 0 && <div><p className="text-xs text-muted mb-1.5">Nice to have</p><div className="flex flex-wrap gap-1.5">{o.preferredSkills.map((s) => <span key={s} className={`text-xs px-2.5 py-1 rounded-full border ${pMatched.has(s) ? 'border-success-500/40 bg-success-500/10 text-success-500' : 'border-[var(--border)] text-muted'}`}>{pMatched.has(s) ? '✓ ' : ''}{skillLabel(s)}</span>)}</div></div>}
            </div>)}</Card>
        </div>

        <aside className="space-y-6">
          <Card className="p-5" variant="elevated"><h2 className="text-sm font-semibold mb-3">Timeline</h2>
            <p className={`text-lg font-semibold ${o.urgency === 'critical' ? 'text-danger-500' : ''}`}>{deadlineLabel(o.daysRemaining, o.urgency)}</p>
            <Badge tone={urgencyTone(o.urgency)}>{o.deadline ? `Deadline ${formatDate(o.deadline)}` : 'No deadline listed'}</Badge>
            <dl className="mt-4 space-y-2 text-sm"><Fact label="Registration opens">{formatDate(o.registrationStart)}</Fact><Fact label="Event">{o.eventStart ? `${formatDate(o.eventStart)}${o.eventEnd ? ` – ${formatDate(o.eventEnd)}` : ''}` : 'Not listed'}</Fact></dl>
            {o.deadline && (<div className="mt-4 grid gap-2">
              <Button variant="secondary" size="sm" onClick={() => ics.mutate()} loading={ics.isPending}><CalendarPlus size={14} /> Download .ics</Button>
              {integ.data?.enabled && (calConnected ? <Button variant="secondary" size="sm" onClick={() => setCalOpen(true)}>Add to Google Calendar…</Button> : <Link to="/settings" className="text-xs text-accent-500 text-center focus-ring rounded">Connect Google Calendar in Settings</Link>)}
            </div>)}</Card>

          <Card className="p-5"><h2 className="text-sm font-semibold mb-3">Your progress</h2>
            <Select label="Application status" value={app?.status ?? ''} onChange={(e) => e.target.value && track.mutate(e.target.value as ApplicationStatus)} disabled={track.isPending}>
              {!app && <option value="">Not tracking yet…</option>}{APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
            {!app ? <Button className="w-full mt-3" onClick={() => track.mutate('wishlist')} loading={track.isPending}>Track this application</Button> : <Link to="/applications" className="block text-xs text-accent-500 mt-3 focus-ring rounded">Open timeline in Applications →</Link>}</Card>

          <Card className="p-5"><h2 className="text-sm font-semibold mb-3">Next steps</h2><div className="grid gap-2">
            <Link to={`/team-builder?opportunity=${o.id}`}><Button variant="secondary" className="w-full justify-start"><Users size={14} /> Build a team for this</Button></Link>
            <Link to={`/originality?opportunity=${o.id}`}><Button variant="secondary" className="w-full justify-start"><ShieldCheck size={14} /> Validate an idea for this</Button></Link>
            <Link to={`/compare?ids=${o.id}`}><Button variant="secondary" className="w-full justify-start"><GitCompare size={14} /> Compare with others</Button></Link>
            <Button variant="ghost" className="w-full justify-start text-muted" onClick={() => dismiss.mutate()} loading={dismiss.isPending}><EyeOff size={14} /> Not interested</Button></div></Card>

          <Card className="p-5"><h2 className="text-sm font-semibold mb-2">Source</h2><dl className="space-y-2">
            <Fact label="Listed by">{o.isDemo ? 'Demo data (not a live source)' : o.source}</Fact>
            {!o.isDemo && <><Fact label="Verification">{o.verificationStatus === 'verified' ? `Verified ${formatDate(o.lastVerifiedAt)}` : 'Not verified'}</Fact><Fact label="Freshness">{titleCase(o.freshnessStatus)}{o.lastSeenAt ? ` · last seen ${formatDate(o.lastSeenAt)}` : ''}</Fact></>}</dl>
            {me?.isAdmin && o.sources.length > 0 && <p className="text-[11px] text-muted mt-2">Ingested from: {o.sources.map((s) => s.name).join(', ')}</p>}</Card>
        </aside>
      </div>

      <Dialog open={calOpen} onClose={() => setCalOpen(false)} title="Add to Google Calendar?" description="Nothing is added until you confirm." footer={<><Button variant="ghost" onClick={() => setCalOpen(false)}>Cancel</Button><Button onClick={() => addCal.mutate()} loading={addCal.isPending}>Add event</Button></>}>
        <p className="text-sm">An all-day event <strong>“Deadline: {o.title}”</strong> on <strong>{formatDate(o.deadline)}</strong> with a reminder the day before.</p>
      </Dialog>
    </article>
  )
}
