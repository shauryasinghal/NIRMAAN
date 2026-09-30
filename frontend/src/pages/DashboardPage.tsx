import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CalendarClock, Lightbulb, Target, Users } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge, EmptyState, ErrorState, SkeletonDashboard } from '../components/ui/primitives'
import { DemoBadge, FitBadge, Notice, Section, StatCard, StatusPill } from '../components/ui/kit'
import { SaveButton } from '../components/opportunities/SaveButton'
import { useAuth } from '../context/AuthContext'
import { dashboardService } from '../lib/services'
import { deadlineLabel, formatDate, titleCase, urgencyTone } from '../lib/format'
import { APPLICATION_STATUSES } from '../types'

const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' }

export function DashboardPage() {
  const { me } = useAuth()
  const q = useQuery({ queryKey: ['dashboard'], queryFn: dashboardService.get })
  if (q.isLoading) return <SkeletonDashboard />
  if (q.isError || !q.data) return <ErrorState message={(q.error as Error)?.message} onRetry={() => q.refetch()} />
  const d = q.data
  const nba = d.nextBestAction
  const pipelineTotal = d.pipeline.total
  return (
    <div>
      <header className="mb-6"><h1 className="text-2xl font-semibold tracking-tight">{greeting()}{d.greetingName ? `, ${d.greetingName}` : me?.fullName ? `, ${me.fullName.split(' ')[0]}` : ''}</h1>
        <p className="text-sm text-muted mt-1">Here's where things stand — every number below is computed from your own data.</p></header>

      {!d.profile.completeness.complete && <div className="mb-6"><Notice tone="warning" title={`Your profile is ${d.profile.completeness.percent}% complete`}>Add your {d.profile.completeness.missing.join(', ')} for scores that mean something. <Link to="/profile" className="underline">Finish profile</Link></Notice></div>}

      <Card variant="highlight" className="p-5 mb-6" aria-label="Next best action">
        <div className="flex items-center gap-2 text-[11px] font-medium text-accent-500 tracking-[0.15em] uppercase mb-2"><Target size={13} aria-hidden /> Next best action</div>
        {nba.action ? (<div className="flex flex-wrap items-center justify-between gap-4"><div className="min-w-0 max-w-2xl"><h2 className="text-lg font-semibold leading-snug">{nba.action.title}</h2><p className="text-sm text-muted mt-1">{nba.action.reason}</p></div>
          <Link to={nba.action.cta.href}><Button>{nba.action.cta.label} <ArrowRight size={15} /></Button></Link></div>) : <p className="text-sm">{nba.message ?? 'Nothing needs your attention right now.'}</p>}
        {nba.alternatives.length > 0 && <details className="mt-4"><summary className="text-xs text-muted cursor-pointer focus-ring rounded w-fit">{nba.alternatives.length} more thing{nba.alternatives.length === 1 ? '' : 's'} coming up</summary>
          <ul className="mt-2 space-y-1.5">{nba.alternatives.map((a) => <li key={a.kind + a.title} className="text-sm flex flex-wrap items-baseline justify-between gap-2"><span><Link to={a.cta.href} className="font-medium hover:underline focus-ring rounded">{a.title}</Link> <span className="text-muted">· {a.reason}</span></span></li>)}</ul></details>}
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <StatCard label="Saved" value={d.totals.saved} to="/saved" /><StatCard label="Applications" value={d.totals.applications} to="/applications" /><StatCard label="Teams" value={d.totals.teams} to="/team-builder" />
        <StatCard label="Ideas checked" value={d.totals.ideas} to="/originality/history" /><StatCard label="Strong matches (70%+)" value={d.totals.opportunitiesAbove70} hint={`of ${d.totals.opportunitiesScored} scored`} to="/opportunities?sort=fit" /></div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 min-w-0">
          <Section title="Recommended for you" hint={`Based on ${d.basedOn.confirmedSkills} confirmed skills, ${d.basedOn.interests} interests${d.basedOn.behaviouralEvents >= 5 ? ` and ${d.basedOn.behaviouralEvents} recent actions` : ''}.`} action={<Link to="/opportunities?sort=fit" className="text-xs text-accent-500 focus-ring rounded">See all →</Link>}>
            {d.recommendations.length === 0 ? <EmptyState icon={Target} title="No recommendations yet" description="Add skills and interests to your profile so NIRMAAN can rank opportunities for you." action={<Link to="/profile"><Button variant="secondary">Update profile</Button></Link>} /> : (
              <ul className="space-y-3">{d.recommendations.map((o) => (
                <li key={o.id}><Card variant="interactive" className="p-4 relative"><div className="flex items-start gap-3"><div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">{o.category && <Badge tone="accent">{o.category}</Badge>}{o.isDemo && <DemoBadge />}{o.applicationStatus && <StatusPill status={o.applicationStatus} />}</div>
                  <Link to={`/opportunities/${o.id}`} className="font-medium text-sm after:absolute after:inset-0 focus-ring rounded">{o.title}</Link><p className="text-xs text-muted">{o.organization} · <span className={o.urgency === 'critical' ? 'text-danger-500 font-medium' : ''}>{deadlineLabel(o.daysRemaining, o.urgency)}</span></p>
                  {o.fit && (o.fit.reasons[0] || o.fit.concerns[0]) && <p className="text-xs text-muted mt-1.5 line-clamp-2">{o.fit.reasons[0] ?? o.fit.concerns[0]}</p>}</div>
                  {o.fit && <FitBadge score={o.fit.overall} confidence={o.fit.confidence} />}</div><div className="relative z-10 mt-2"><SaveButton id={o.id} saved={o.saved} /></div></Card></li>))}</ul>)}
          </Section>
          {d.skillGaps.length > 0 && <Section title="Skill gaps worth closing" hint="Missing skills ranked by how many relevant opportunities they'd open up." action={<a id="skills" className="sr-only" href="#skills">Skills</a>}>
            <ul className="space-y-3">{d.skillGaps.map((g) => (<li key={g.skill}><Card className="p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium text-sm capitalize">{g.skill} {g.inferred && <Badge tone="warning">suggested — unconfirmed</Badge>}</p><p className="text-xs text-muted mt-0.5">Missing from {g.unlocks} relevant {g.unlocks === 1 ? 'opportunity' : 'opportunities'}{g.highFitUnlocks > 0 && ` · lifts ${g.highFitUnlocks} to 75%+ fit`}</p></div><Badge>{g.teamRole}</Badge></div>
              <p className="text-sm mt-2">{g.action}</p>{g.opportunities[0] && <p className="text-xs text-muted mt-2">e.g. <Link to={`/opportunities/${g.opportunities[0].id}`} className="hover:underline focus-ring rounded">{g.opportunities[0].title}</Link>: {Math.round(g.opportunities[0].fitNow)}% → {Math.round(g.opportunities[0].fitWithSkill)}% with it</p>}{g.inferred && <Link to="/profile" className="text-xs text-accent-500 mt-1 inline-block focus-ring rounded">Review in profile →</Link>}</Card></li>))}</ul></Section>}
        </div>

        <div className="space-y-8 min-w-0">
          <Section title="Upcoming deadlines" hint="From what you saved or are applying to.">{d.deadlines.length === 0 ? <p className="text-sm text-muted">No deadlines in the next 30 days for your saved or in-progress opportunities.</p> : <ul className="space-y-2">{d.deadlines.map((x) => <li key={x.opportunityId} className="surface rounded-lg p-3"><Link to={`/opportunities/${x.opportunityId}`} className="text-sm font-medium hover:underline focus-ring rounded">{x.title}</Link><div className="flex items-center gap-2 mt-1 text-xs text-muted"><CalendarClock size={12} aria-hidden /><Badge tone={urgencyTone(x.urgency)}>{deadlineLabel(x.daysRemaining, x.urgency)}</Badge><span>{formatDate(x.deadline, { day: 'numeric', month: 'short' })}</span>{x.status && <StatusPill status={x.status} />}</div></li>)}</ul>}</Section>

          <Section title="Application pipeline" action={<Link to="/applications" className="text-xs text-accent-500 focus-ring rounded">Open →</Link>}>{pipelineTotal === 0 ? <p className="text-sm text-muted">You aren't tracking any applications yet.</p> : (<div>
            <div className="flex h-2 rounded-full overflow-hidden bg-black/[0.06] dark:bg-white/[0.08]" role="img" aria-label={`Pipeline: ${APPLICATION_STATUSES.filter((s) => d.pipeline.counts[s]).map((s) => `${d.pipeline.counts[s]} ${s}`).join(', ')}`}>{APPLICATION_STATUSES.map((s, i) => d.pipeline.counts[s] > 0 && <span key={s} style={{ width: `${(d.pipeline.counts[s] / pipelineTotal) * 100}%`, background: `color-mix(in srgb, var(--color-accent-500) ${30 + (i * 70) / 9}%, var(--color-cyan-500))` }} />)}</div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">{APPLICATION_STATUSES.filter((s) => d.pipeline.counts[s] > 0).map((s) => <li key={s} className="flex justify-between"><span className="capitalize text-muted">{titleCase(s)}</span><span className="tabular-nums font-medium">{d.pipeline.counts[s]}</span></li>)}</ul></div>)}</Section>

          {d.insights.length > 0 && <Section title="Needs attention"><ul className="space-y-2">{d.insights.map((i, n) => <li key={n}><Notice tone={i.kind === 'urgent' ? 'danger' : 'warning'} title={i.title}>{i.detail}</Notice></li>)}</ul></Section>}

          <Section title="Teams" action={<Link to="/team-builder" className="text-xs text-accent-500 focus-ring rounded">Team Builder →</Link>}>
            {d.pendingInvitations > 0 && <div className="mb-2"><Notice tone="accent" title={`${d.pendingInvitations} pending invitation${d.pendingInvitations === 1 ? '' : 's'}`}><Link to="/team-builder" className="underline">Respond</Link></Notice></div>}
            {d.teams.length === 0 ? <p className="text-sm text-muted">No teams yet.</p> : <ul className="space-y-2">{d.teams.map((t) => <li key={t.id} className="surface rounded-lg p-3 text-sm flex items-center gap-2"><Users size={14} className="text-muted shrink-0" aria-hidden /><span className="min-w-0 truncate">{t.name || t.opportunity || 'Untitled team'}</span><Badge>{t.status}</Badge></li>)}</ul>}</Section>

          <Section title="Recent ideas" action={<Link to="/originality" className="text-xs text-accent-500 focus-ring rounded">Check one →</Link>}>{d.ideas.length === 0 ? <p className="text-sm text-muted flex gap-2"><Lightbulb size={14} className="mt-0.5 shrink-0" aria-hidden /> Nothing checked yet.</p> : <ul className="space-y-2">{d.ideas.map((i) => <li key={i.id} className="surface rounded-lg p-3 text-sm"><Link to={`/originality/history/${i.id}`} className="font-medium hover:underline focus-ring rounded">{i.title}</Link><div className="flex gap-2 mt-1"><Badge>{titleCase(i.status)}</Badge>{i.topSimilarity !== null && <span className="text-xs text-muted tabular-nums">{Math.round(i.topSimilarity)}% closest</span>}</div></li>)}</ul>}</Section>
        </div>
      </div>
    </div>
  )
}
