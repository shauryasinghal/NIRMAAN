import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card } from '../components/ui/Card'
import { Badge, EmptyState, ErrorState, Skeleton } from '../components/ui/primitives'
import { Dialog, Notice, PageHeader, Select, Toggle } from '../components/ui/kit'
import { alertService, opportunityService, profileService } from '../lib/services'
import { EMPTY_FILTERS } from '../lib/filters'
import { formatDate, timeAgo } from '../lib/format'
import type { ApiError } from '../lib/api'
import type { Alert, AlertEvaluation, AlertInput, WorkMode, Participation } from '../types'

const blank: AlertInput = { name: '', query: '', category: null, domain: null, skill: null, location: null, workMode: null, participation: null, deadlineWithinDays: null, minFit: 60, enabled: true }
const summary = (a: Alert) => [a.query && `“${a.query}”`, a.category, a.domain, a.skill && `skill: ${a.skill}`, a.location, a.workMode, a.participation, a.deadlineWithinDays && `closes ≤ ${a.deadlineWithinDays}d`, a.minFit != null && `fit ≥ ${a.minFit}%`].filter(Boolean) as string[]

function AlertForm({ initial, onClose, editing }: { initial: AlertInput; onClose: () => void; editing?: string }) {
  const qc = useQueryClient()
  const [f, setF] = useState<AlertInput>(initial); const [touched, setTouched] = useState(false)
  const facets = useQuery({ queryKey: ['facets', 'alerts'], queryFn: () => opportunityService.facets(EMPTY_FILTERS), staleTime: 5 * 60_000 })
  const skills = useQuery({ queryKey: ['vocab', 'skills'], queryFn: profileService.skills, staleTime: Infinity })
  const interests = useQuery({ queryKey: ['vocab', 'interests'], queryFn: profileService.interests, staleTime: Infinity })
  const save = useMutation({ mutationFn: () => (editing ? alertService.update(editing, f) : alertService.create(f)), onSuccess: () => { toast.success(editing ? 'Alert updated' : 'Alert created'); qc.invalidateQueries({ queryKey: ['alerts'] }); onClose() }, onError: (e: ApiError) => toast.error(e.message) })
  const set = (p: Partial<AlertInput>) => setF({ ...f, ...p })
  const nameErr = touched && !f.name.trim() ? 'Give your alert a name' : undefined
  const noCriteria = !f.query?.trim() && !f.category && !f.domain && !f.skill && !f.location && !f.workMode && !f.participation && !f.deadlineWithinDays
  return (
    <Dialog open onClose={onClose} title={editing ? 'Edit alert' : 'New smart alert'} description="You'll be notified when a new or updated opportunity matches all of this." wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => { setTouched(true); if (f.name.trim()) save.mutate() }}>{editing ? 'Save changes' : 'Create alert'}</Button></>}>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2"><Input label="Name" maxLength={80} value={f.name} onChange={(e) => set({ name: e.target.value })} error={nameErr} placeholder="e.g. Remote ML internships" /></div>
        <Input label="Keywords" maxLength={200} value={f.query ?? ''} onChange={(e) => set({ query: e.target.value })} placeholder="title, organization…" />
        <Select label="Category" value={f.category ?? ''} onChange={(e) => set({ category: e.target.value || null })}><option value="">Any</option>{facets.data?.category.map((c) => <option key={c.value}>{c.value}</option>)}</Select>
        <Select label="Domain" value={f.domain ?? ''} onChange={(e) => set({ domain: e.target.value || null })}><option value="">Any</option>{interests.data?.map((i) => <option key={i.slug}>{i.name}</option>)}</Select>
        <Select label="Skill" value={f.skill ?? ''} onChange={(e) => set({ skill: e.target.value || null })}><option value="">Any</option>{skills.data?.map((s) => <option key={s.slug}>{s.name}</option>)}</Select>
        <Input label="Location" maxLength={160} value={f.location ?? ''} onChange={(e) => set({ location: e.target.value || null })} placeholder="City or region" />
        <Select label="Work mode" value={f.workMode ?? ''} onChange={(e) => set({ workMode: (e.target.value || null) as WorkMode | null })}><option value="">Any</option><option value="remote">Remote</option><option value="onsite">On-site</option><option value="hybrid">Hybrid</option></Select>
        <Select label="Opportunity type" value={f.participation ?? ''} onChange={(e) => set({ participation: (e.target.value || null) as Participation | null })}><option value="">Individual or team</option><option value="individual">Individual</option><option value="team">Team</option></Select>
        <Select label="Deadline window" value={f.deadlineWithinDays ?? ''} onChange={(e) => set({ deadlineWithinDays: e.target.value ? Number(e.target.value) : null })}><option value="">Any</option><option value="7">Within 7 days</option><option value="14">Within 14 days</option><option value="30">Within 30 days</option><option value="60">Within 60 days</option></Select>
        <div className="sm:col-span-2"><label htmlFor="alert-fit" className="block text-xs font-medium text-muted mb-1.5">Minimum fit: <strong className="text-[var(--text)]">{f.minFit ?? 0}%</strong></label><input id="alert-fit" type="range" min={0} max={100} step={5} value={f.minFit ?? 0} onChange={(e) => set({ minFit: Number(e.target.value) })} className="w-full accent-[var(--color-accent-500)]" /></div>
        <div className="sm:col-span-2"><Toggle checked={f.enabled !== false} onChange={(v) => set({ enabled: v })} label="Enabled" description="Paused alerts don't evaluate or notify." /></div>
        {noCriteria && <div className="sm:col-span-2"><Notice tone="warning">With no criteria this alert matches everything above your minimum fit.</Notice></div>}
      </div>
    </Dialog>
  )
}

export function SmartAlertsPage() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['alerts'], queryFn: alertService.list })
  const [form, setForm] = useState<{ initial: AlertInput; editing?: string } | null>(null)
  const [del, setDel] = useState<Alert | null>(null)
  const [results, setResults] = useState<Record<string, AlertEvaluation>>({})
  const [hitsFor, setHitsFor] = useState<Alert | null>(null)
  const evaluate = useMutation({ mutationFn: (id: string) => alertService.evaluate(id), onSuccess: (r) => { setResults((s) => ({ ...s, [r.alertId]: r })); toast.success(r.matches.length ? `${r.matches.length} new match${r.matches.length === 1 ? '' : 'es'}` : 'No new matches right now'); for (const k of ['alerts', 'notifications']) qc.invalidateQueries({ queryKey: [k] }) }, onError: (e: ApiError) => toast.error(e.message) })
  const toggle = useMutation({ mutationFn: (a: Alert) => alertService.update(a.id, { enabled: !a.enabled }), onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }), onError: (e: ApiError) => toast.error(e.message) })
  const remove = useMutation({ mutationFn: (id: string) => alertService.remove(id), onSuccess: () => { toast.success('Alert deleted'); setDel(null); qc.invalidateQueries({ queryKey: ['alerts'] }) }, onError: (e: ApiError) => toast.error(e.message) })
  const hits = useQuery({ queryKey: ['alert-hits', hitsFor?.id], queryFn: () => alertService.hits(hitsFor!.id), enabled: !!hitsFor })
  return (
    <div>
      <PageHeader title="Smart alerts" subtitle="Describe what you're looking for once. When a new or updated opportunity matches — and fits you well enough — you get a notification." actions={<Button onClick={() => setForm({ initial: blank })}><Plus size={14} /> New alert</Button>} />
      {q.isLoading ? <div className="space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>
        : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
        : !q.data?.length ? <EmptyState icon={Bell} title="No alerts yet" description="Try “remote internships that fit me 70%+” or “hackathons closing this week”." action={<Button onClick={() => setForm({ initial: blank })}>Create your first alert</Button>} />
        : <ul className="space-y-3">{q.data.map((a) => { const r = results[a.id]; return (
          <li key={a.id}><Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><h2 className="font-semibold text-sm flex items-center gap-2">{a.name}{!a.enabled && <Badge tone="warning">paused</Badge>}</h2>
                <div className="flex flex-wrap gap-1.5 mt-2">{summary(a).map((s) => <Badge key={s}>{s}</Badge>)}</div>
                <p className="text-xs text-muted mt-2">{a.hitCount} match{a.hitCount === 1 ? '' : 'es'} so far · {a.lastEvaluatedAt ? `last checked ${timeAgo(a.lastEvaluatedAt)}` : 'not checked yet'}</p></div>
              <div className="flex items-center gap-1 flex-wrap">
                <Button size="sm" variant="secondary" onClick={() => evaluate.mutate(a.id)} loading={evaluate.isPending && evaluate.variables === a.id} disabled={!a.enabled} title={a.enabled ? 'Check the catalog now' : 'Enable the alert first'}><Play size={13} /> Check now</Button>
                {a.hitCount > 0 && <Button size="sm" variant="ghost" onClick={() => setHitsFor(a)}>Matches</Button>}
                <Button size="sm" variant="ghost" onClick={() => toggle.mutate(a)} aria-label={a.enabled ? `Pause ${a.name}` : `Resume ${a.name}`}>{a.enabled ? 'Pause' : 'Resume'}</Button>
                <Button size="sm" variant="ghost" onClick={() => setForm({ editing: a.id, initial: { name: a.name, query: a.query, category: a.category, domain: a.domain, skill: a.skill, location: a.location, workMode: a.workMode, participation: a.participation, deadlineWithinDays: a.deadlineWithinDays, minFit: a.minFit, enabled: a.enabled } })} aria-label={`Edit ${a.name}`}><Pencil size={13} /></Button>
                <Button size="sm" variant="ghost" onClick={() => setDel(a)} aria-label={`Delete ${a.name}`}><Trash2 size={13} /></Button></div></div>
            {r && <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}><p className="text-xs text-muted mb-2">Checked {r.candidates} candidate{r.candidates === 1 ? '' : 's'} · {r.notificationsCreated} notification{r.notificationsCreated === 1 ? '' : 's'} created</p>
              {r.matches.length === 0 ? <p className="text-sm text-muted">Nothing new matches right now. Future opportunities will be checked automatically.</p> : <ul className="space-y-1.5">{r.matches.map((m) => <li key={m.opportunityId} className="flex justify-between gap-3 text-sm"><Link className="hover:underline truncate focus-ring rounded" to={`/opportunities/${m.opportunityId}`}>{m.title} <span className="text-muted">· {m.organization}</span></Link><span className="text-xs font-medium tabular-nums">{Math.round(m.fit)}%</span></li>)}</ul>}</div>}
          </Card></li>) })}</ul>}
      {form && <AlertForm {...form} onClose={() => setForm(null)} />}
      <Dialog open={!!del} onClose={() => setDel(null)} title="Delete this alert?" description={del?.name} footer={<><Button variant="ghost" onClick={() => setDel(null)}>Cancel</Button><Button variant="danger" onClick={() => del && remove.mutate(del.id)} loading={remove.isPending}>Delete</Button></>}><p className="text-sm text-muted">Past notifications stay in your inbox.</p></Dialog>
      <Dialog open={!!hitsFor} onClose={() => setHitsFor(null)} title={`Matches for “${hitsFor?.name}”`}>
        {hits.isLoading ? <Skeleton className="h-24 w-full" /> : hits.isError ? <ErrorState onRetry={() => hits.refetch()} /> : <ul className="space-y-2">{hits.data?.items.map((h) => <li key={h.opportunityId} className="flex justify-between gap-3 text-sm"><Link to={`/opportunities/${h.opportunityId}`} onClick={() => setHitsFor(null)} className="hover:underline focus-ring rounded">{h.title}<span className="block text-xs text-muted">{h.organization} · matched {formatDate(h.matchedAt)}</span></Link>{h.fit != null && <span className="text-xs font-medium tabular-nums">{Math.round(h.fit)}%</span>}</li>)}</ul>}
      </Dialog>
    </div>
  )
}
