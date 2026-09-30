import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Info, Users, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Badge, EmptyState, ErrorState, ProcessingState, Skeleton } from '../components/ui/primitives'
import { ChipSelector } from '../components/common/ChipSelector'
import { DemoBadge, Dialog, Meter, Notice, PageHeader, Tabs } from '../components/ui/kit'
import { opportunityService, profileService, teamService } from '../lib/services'
import { EMPTY_FILTERS } from '../lib/filters'
import { timeAgo } from '../lib/format'
import type { ApiError } from '../lib/api'
import type { TeamMemberSuggestion, TeamRecord, TeamSuggestion } from '../types'

function MemberCard({ m, picked, onPick }: { m: TeamMemberSuggestion; picked?: boolean; onPick?: () => void }) {
  return (
    <Card className="p-4" role="article" aria-label={m.name}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="font-medium text-sm">{m.name}{m.isYou && <span className="text-muted font-normal"> (you)</span>}</p><p className="text-xs text-accent-500 font-medium">{m.role}</p></div>
        {onPick && <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer min-h-[32px]"><input type="checkbox" checked={!!picked} onChange={onPick} className="h-4 w-4 accent-[var(--color-accent-500)]" /> Invite</label>}
      </div>
      <p className="text-sm mt-2 leading-relaxed">{m.why}</p>
      <dl className="mt-3 grid gap-2 text-xs">
        {m.contributedSkills.length > 0 && <div><dt className="text-muted">Brings</dt><dd className="flex flex-wrap gap-1 mt-0.5">{m.contributedSkills.map((s) => <Badge key={s} tone="success">{s}</Badge>)}</dd></div>}
        {m.complementarySkills.length > 0 && <div><dt className="text-muted">Also adds</dt><dd className="flex flex-wrap gap-1 mt-0.5">{m.complementarySkills.map((s) => <Badge key={s}>{s}</Badge>)}</dd></div>}
        {m.overlapSkills.length > 0 && <div><dt className="text-muted">Overlaps with the team</dt><dd className="flex flex-wrap gap-1 mt-0.5">{m.overlapSkills.map((s) => <Badge key={s} tone="warning">{s}</Badge>)}</dd></div>}
        {m.compatibility.score !== null && <div><dt className="text-muted">Compatibility</dt><dd><Meter label="Availability · experience · interests" value={m.compatibility.score} /><p className="text-[11px] text-muted mt-1">{Object.entries(m.compatibility.parts).filter(([, v]) => v !== null).map(([k, v]) => `${k} ${Math.round((v as number) * 100)}%`).join(' · ')}</p></dd></div>}
      </dl>
    </Card>
  )
}

function Build() {
  const [sp] = useSearchParams(); const qc = useQueryClient()
  const oppId = sp.get('opportunity')
  const [required, setRequired] = useState<string[]>([]); const [size, setSize] = useState(4)
  const [result, setResult] = useState<TeamSuggestion | null>(null)
  const [picked, setPicked] = useState<string[]>([]); const [view, setView] = useState<'team' | 'ranked'>('team')
  const [saveOpen, setSaveOpen] = useState(false); const [name, setName] = useState(''); const [note, setNote] = useState('')
  const [search, setSearch] = useState(''); const [chosenOpp, setChosenOpp] = useState<string | null>(oppId)
  const skills = useQuery({ queryKey: ['vocab', 'skills'], queryFn: profileService.skills, staleTime: Infinity })
  const opp = useQuery({ queryKey: ['opportunity', chosenOpp], queryFn: () => opportunityService.detail(chosenOpp!), enabled: !!chosenOpp })
  const found = useQuery({ queryKey: ['opp-picker', search], queryFn: () => opportunityService.search({ ...EMPTY_FILTERS, q: search, sort: 'relevance' }, 5), enabled: search.trim().length >= 2 && !chosenOpp })

  const suggest = useMutation({
    mutationFn: () => teamService.suggest({ opportunityId: chosenOpp, requiredSkills: chosenOpp ? [] : required, size }),
    onSuccess: (r) => { setResult(r); setPicked(r.members.filter((m) => !m.isYou).map((m) => m.id)); setView('team') }, onError: (e: ApiError) => toast.error(e.message),
  })
  const save = useMutation({
    mutationFn: () => teamService.save({ opportunityId: chosenOpp, requiredSkills: chosenOpp ? [] : required, size, memberIds: picked, name: name.trim() || undefined, note: note.trim() || undefined }),
    onSuccess: () => { toast.success(picked.length ? 'Team saved and invitations sent' : 'Team saved'); setSaveOpen(false); for (const k of ['teams', 'dashboard', 'activity']) qc.invalidateQueries({ queryKey: [k] }) }, onError: (e: ApiError) => toast.error(e.message),
  })
  useEffect(() => { setResult(null) }, [chosenOpp])
  const cap = opp.data?.maxTeamSize ?? 10
  const ready = chosenOpp ? !!opp.data : required.length > 0
  const invitees = useMemo(() => (result ? [...result.members, ...result.candidates].filter((m, i, a) => picked.includes(m.id) && a.findIndex((x) => x.id === m.id) === i) : []), [result, picked])

  return (
    <div className="grid lg:grid-cols-[340px_1fr] gap-6">
      <Card className="p-5 self-start space-y-5">
        <div><h2 className="text-sm font-semibold mb-2">1 · What are you building for?</h2>
          {chosenOpp ? (opp.isLoading ? <Skeleton className="h-16 w-full" /> : opp.data ? (
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}><div className="flex justify-between gap-2"><Link to={`/opportunities/${opp.data.id}`} className="text-sm font-medium hover:underline focus-ring rounded">{opp.data.title}</Link><button className="text-muted hover:text-danger-500 focus-ring rounded p-0.5" onClick={() => setChosenOpp(null)} aria-label="Use manual skills instead"><X size={14} /></button></div>
              {opp.data.isDemo && <DemoBadge className="mt-1" />}
              <p className="text-xs text-muted mt-1">Needs: {[...opp.data.requiredSkills, ...opp.data.preferredSkills.map((s) => `${s} (nice to have)`)].join(', ') || 'no skills listed'}</p>
              <p className="text-xs text-muted">{opp.data.participation === 'team' ? `Team of ${opp.data.minTeamSize ?? '?'}${opp.data.maxTeamSize ? `–${opp.data.maxTeamSize}` : '+'}` : 'Team size not specified'}</p></div>
          ) : <ErrorState message="Couldn't load that opportunity." />) : (<>
            <Input label="Find an opportunity" placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {found.data?.items.length ? <ul className="mt-2 rounded-lg border divide-y" style={{ borderColor: 'var(--border)' }}>{found.data.items.map((o) => <li key={o.id}><button className="w-full text-left px-3 py-2 text-sm hover:bg-black/[0.04] dark:hover:bg-white/[0.06] focus-ring" onClick={() => setChosenOpp(o.id)}>{o.title}<span className="block text-xs text-muted">{o.organization}</span></button></li>)}</ul> : null}
            <p className="text-xs text-muted my-3">…or choose the skills your team needs:</p>
            <ChipSelector options={(skills.data ?? []).map((s) => s.name)} selected={required} onChange={setRequired} allowCustom={false} placeholder="Add a required skill…" /></>)}
        </div>
        <div><h2 className="text-sm font-semibold mb-2">2 · Team size (including you)</h2><label htmlFor="tb-size" className="sr-only">Team size</label>
          <input id="tb-size" type="range" min={2} max={Math.max(2, cap)} value={Math.min(size, cap)} onChange={(e) => setSize(Number(e.target.value))} className="w-full accent-[var(--color-accent-500)]" /><p className="text-xs text-muted">{Math.min(size, cap)} people{opp.data?.maxTeamSize ? ` (this opportunity allows up to ${opp.data.maxTeamSize})` : ''}. NIRMAAN stops early if nobody else adds anything.</p></div>
        <Button className="w-full" onClick={() => suggest.mutate()} loading={suggest.isPending} disabled={!ready}>Build my team</Button>
        <Notice title="Who can appear?"><Info size={0} className="hidden" />Only students who turned on “Open to team invitations” in their profile. Skill and availability details are all that's shown.</Notice>
      </Card>

      <div className="min-w-0">
        {suggest.isPending && <ProcessingState label="Matching skills to what this team needs…" />}
        {!result && !suggest.isPending && <EmptyState icon={Users} title="Build a team that covers what you're missing" description="Pick an opportunity (or skills) and NIRMAAN will find complementary teammates, explain each pick and show the coverage." />}
        {result && (<>
          <Card className="p-5 mb-5" variant="elevated"><div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="text-sm font-semibold">Coverage of required skills</h2><div className="flex flex-wrap gap-1.5 mt-2">{Object.entries(result.coverage).map(([s, ok]) => <span key={s} className={`text-xs px-2.5 py-1 rounded-full border capitalize ${ok ? 'border-success-500/40 bg-success-500/10 text-success-500' : 'border-danger-500/40 bg-danger-500/10 text-danger-500'}`}>{ok ? '✓' : '✗'} {s}</span>)}</div>
              <p className="text-xs text-muted mt-2">Before: {result.coverageBefore.covered.length}/{Object.keys(result.coverage).length} covered by you alone → after: {Object.values(result.coverage).filter(Boolean).length}/{Object.keys(result.coverage).length}</p></div>
            <div className="text-right"><div className="text-3xl font-semibold tabular-nums">{Math.round(result.metrics.score * 100)}</div><div className="text-[11px] text-muted uppercase tracking-wide">Team balance</div></div></div>
            <p className="text-sm mt-4">{result.summary}</p>
            <details className="mt-4"><summary className="text-xs font-medium cursor-pointer text-accent-500 focus-ring rounded w-fit">How the balance score is calculated</summary>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mt-3"><Meter label="Skill coverage (40%)" value={result.metrics.skillCoverage} /><Meter label="Role diversity (25%)" value={result.metrics.roleDiversity} /><Meter label="Complementarity (25%)" value={result.metrics.complementarity} /><Meter label="Redundancy (lower is better, 10%)" value={result.metrics.redundancy} tone="var(--color-warning-500)" /></div>
              <p className="text-[11px] text-muted mt-3"><code>{result.metrics.formula}</code><br />{result.metrics.note} Roles here: {result.metrics.roles.join(', ')}.</p></details></Card>
          {result.uncovered.length > 0 && <div className="mb-5"><Notice tone="warning" title="Not fully covered">Nobody available covers: {result.uncovered.join(', ')}. Learn these, widen your search or adjust the scope.</Notice></div>}
          <Tabs label="Result view" value={view} onChange={setView} tabs={[{ id: 'team', label: 'Suggested team', count: result.members.length }, { id: 'ranked', label: 'All candidates ranked', count: result.candidates.length }]} />
          <div className="mt-4" role="tabpanel" id={`panel-${view}`} aria-labelledby={`tab-${view}`}>
            {view === 'team' ? <div className="grid md:grid-cols-2 gap-4">{result.members.map((m) => <MemberCard key={m.id} m={m} picked={picked.includes(m.id)} onPick={m.isYou ? undefined : () => setPicked((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]))} />)}</div>
              : result.candidates.length === 0 ? <EmptyState title="Nobody is available yet" description={`${result.poolSize} students are open to team invitations right now.`} /> : <ol className="grid md:grid-cols-2 gap-4">{result.candidates.map((m) => <li key={m.id}><MemberCard m={m} picked={picked.includes(m.id)} onPick={() => setPicked((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]))} /></li>)}</ol>}
          </div>
          <div className="sticky bottom-20 md:bottom-4 mt-6 surface-elevated rounded-xl p-3 flex items-center justify-between gap-3"><p className="text-sm">{picked.length} {picked.length === 1 ? 'person' : 'people'} selected to invite</p><Button onClick={() => setSaveOpen(true)}>Save team{picked.length ? ' & invite' : ''}</Button></div>
        </>)}
      </div>

      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)} title="Save this team" description={picked.length ? 'Invitations are sent as notifications. People can accept or decline.' : 'No one selected — this saves a team with just you.'}
        footer={<><Button variant="ghost" onClick={() => setSaveOpen(false)}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending}>{picked.length ? `Invite ${picked.length}` : 'Save'}</Button></>}>
        <div className="space-y-4"><Input label="Team name (optional)" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /><Input label="Message to invitees (optional)" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          {invitees.length > 0 && <ul className="text-sm space-y-1">{invitees.map((m) => <li key={m.id}>• {m.name} <span className="text-muted">— {m.role}</span></li>)}</ul>}</div>
      </Dialog>
    </div>
  )
}

function MyTeams() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['teams'], queryFn: teamService.list })
  const [del, setDel] = useState<TeamRecord | null>(null)
  const inval = () => { for (const k of ['teams', 'dashboard', 'notifications']) qc.invalidateQueries({ queryKey: [k] }) }
  const respond = useMutation({ mutationFn: ({ id, accept }: { id: string; accept: boolean }) => teamService.respond(id, accept), onSuccess: (_r, v) => { toast.success(v.accept ? 'You joined the team' : 'Invitation declined'); inval() }, onError: (e: ApiError) => toast.error(e.message) })
  const remove = useMutation({ mutationFn: (id: string) => teamService.remove(id), onSuccess: () => { toast.success('Team deleted'); setDel(null); inval() }, onError: (e: ApiError) => toast.error(e.message) })
  if (q.isLoading) return <Skeleton className="h-40 w-full" />
  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
  if (!q.data?.items.length) return <EmptyState icon={Users} title="No teams yet" description="Build one from any opportunity, or wait for an invitation." />
  return (<>
    <ul className="space-y-4">{q.data.items.map((t) => (
      <li key={t.id}><Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-sm">{t.name || (t.opportunity ? `Team for ${t.opportunity.title}` : 'Untitled team')}</h2>
          <p className="text-xs text-muted mt-0.5">{t.opportunity && <Link to={`/opportunities/${t.opportunity.id}`} className="hover:underline focus-ring rounded">{t.opportunity.title}</Link>} · {timeAgo(t.createdAt)} · coverage {Math.round(t.coverage * 100)}% · balance {Math.round(t.diversity * 100)}</p></div>
          <div className="flex gap-2 items-center">{t.myStatus === 'invited' ? (<><Button size="sm" onClick={() => respond.mutate({ id: t.id, accept: true })} loading={respond.isPending && respond.variables?.id === t.id}><Check size={13} /> Accept</Button><Button size="sm" variant="secondary" onClick={() => respond.mutate({ id: t.id, accept: false })}>Decline</Button></>) : <Badge tone={t.isOwner ? 'accent' : 'success'}>{t.isOwner ? 'You lead' : 'Member'}</Badge>}
            {t.isOwner && <Button size="sm" variant="ghost" onClick={() => setDel(t)} aria-label="Delete team">Delete</Button>}</div></div>
        {t.myStatus === 'invited' && <div className="mt-3"><Notice tone="accent" title="You've been invited">Accepting shares your name, role and skills with the other members.</Notice></div>}
        {t.note && <p className="text-sm mt-3 italic">“{t.note}”</p>}
        <ul className="mt-4 grid sm:grid-cols-2 gap-2">{t.members.map((m) => <li key={m.id} className="rounded-lg border px-3 py-2 text-sm flex items-center justify-between gap-2" style={{ borderColor: 'var(--border)' }}><span className="min-w-0"><span className="font-medium">{m.name}{m.isYou && ' (you)'}</span><span className="block text-xs text-muted truncate">{m.role ?? '—'}</span></span><Badge tone={m.status === 'accepted' ? 'success' : m.status === 'declined' ? 'danger' : 'warning'}>{m.status}</Badge></li>)}</ul>
      </Card></li>))}</ul>
    <Dialog open={!!del} onClose={() => setDel(null)} title="Delete this team?" footer={<><Button variant="ghost" onClick={() => setDel(null)}>Cancel</Button><Button variant="danger" onClick={() => del && remove.mutate(del.id)} loading={remove.isPending}>Delete</Button></>}><p className="text-sm text-muted">Everyone invited will lose access. This can't be undone.</p></Dialog>
  </>)
}

export function TeamBuilderPage() {
  const [tab, setTab] = useState<'build' | 'teams'>('build')
  const teams = useQuery({ queryKey: ['teams'], queryFn: teamService.list })
  const pending = teams.data?.items.filter((t) => t.myStatus === 'invited').length ?? 0
  return (
    <div>
      <PageHeader title="Team Builder" subtitle="Start from an opportunity's real requirements. NIRMAAN finds people who cover what's missing and explains every pick." />
      <Tabs label="Team Builder" value={tab} onChange={setTab} tabs={[{ id: 'build', label: 'Build a team' }, { id: 'teams', label: pending ? `My teams · ${pending} invitation${pending === 1 ? '' : 's'}` : 'My teams', count: teams.data?.items.length }]} />
      <div className="mt-6" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>{tab === 'build' ? <Build /> : <MyTeams />}</div>
    </div>
  )
}
