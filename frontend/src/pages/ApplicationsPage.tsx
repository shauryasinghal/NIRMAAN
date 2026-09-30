import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ClipboardList, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../components/ui/Button'
import { Textarea, Input } from '../components/ui/Input'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/primitives'
import { DemoBadge, Dialog, Notice, PageHeader, Select, StatusPill, Tabs } from '../components/ui/kit'
import { applicationService } from '../lib/services'
import { deadlineLabel, formatDate, timeAgo, titleCase } from '../lib/format'
import type { ApiError } from '../lib/api'
import { APPLICATION_STATUSES, type Application, type ApplicationStatus } from '../types'

const EVENT_LABEL: Record<string, string> = { created: 'Added to tracker', status_changed: 'Status changed', note_added: 'Notes updated', next_action_set: 'Next action set', reminder_set: 'Reminder' }

function AppCard({ a, onOpen, onMove, moving }: { a: Application; onOpen: () => void; onMove: (s: ApplicationStatus) => void; moving: boolean }) {
  const o = a.opportunity
  return (
    <div className="surface-interactive rounded-lg p-3 text-sm">
      <button onClick={onOpen} className="text-left w-full focus-ring rounded" aria-label={`Open ${o.title}`}><p className="font-medium leading-snug">{o.title}</p><p className="text-xs text-muted">{o.organization}</p></button>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-muted"><span className={o.urgency === 'critical' ? 'text-danger-500 font-medium' : ''}><Clock size={11} className="inline -mt-0.5" aria-hidden /> {deadlineLabel(o.daysRemaining, o.urgency)}</span>{o.isDemo && <DemoBadge />}</div>
      {a.nextAction && <p className="text-xs mt-2">→ {a.nextAction}</p>}
      <Select aria-label={`Move ${o.title} to`} value={a.status} onChange={(e) => onMove(e.target.value as ApplicationStatus)} disabled={moving} className="mt-2 !py-1 text-xs">{APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
    </div>
  )
}

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['application', id], queryFn: () => applicationService.get(id) })
  const a = q.data
  const [f, setF] = useState<{ notes: string; nextAction: string; reminderAt: string } | null>(null)
  const form = f ?? (a ? { notes: a.notes, nextAction: a.nextAction ?? '', reminderAt: a.reminderAt ?? '' } : { notes: '', nextAction: '', reminderAt: '' })
  const [confirmDel, setConfirmDel] = useState(false)
  const inval = () => { for (const k of ['applications', 'application', 'dashboard', 'activity']) qc.invalidateQueries({ queryKey: [k] }) }
  const save = useMutation({ mutationFn: () => applicationService.update(id, { notes: form.notes, nextAction: form.nextAction.trim() || null, reminderAt: form.reminderAt || null }), onSuccess: () => { toast.success('Saved'); setF(null); inval() }, onError: (e: ApiError) => toast.error(e.message) })
  const status = useMutation({ mutationFn: (s: ApplicationStatus) => applicationService.update(id, { status: s }), onSuccess: () => { toast.success('Status updated'); inval() }, onError: (e: ApiError) => toast.error(e.message) })
  const del = useMutation({ mutationFn: () => applicationService.remove(id), onSuccess: () => { toast.success('Removed from tracker'); inval(); onClose() }, onError: (e: ApiError) => toast.error(e.message) })
  return (
    <Dialog open onClose={onClose} title={a?.opportunity.title ?? 'Application'} description={a ? `${a.opportunity.organization} · ${deadlineLabel(a.opportunity.daysRemaining, a.opportunity.urgency)}` : undefined} wide
      footer={<><Button variant="danger" size="sm" className="mr-auto" onClick={() => setConfirmDel(true)}>Remove</Button><Button variant="ghost" onClick={onClose}>Close</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!f}>Save</Button></>}>
      {q.isLoading ? <Skeleton className="h-48 w-full" /> : q.isError || !a ? <ErrorState message={(q.error as Error)?.message} onRetry={() => q.refetch()} /> : (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Select label="Status" value={a.status} onChange={(e) => status.mutate(e.target.value as ApplicationStatus)} disabled={status.isPending}>{APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
            <Input label="Next action" maxLength={300} value={form.nextAction} onChange={(e) => setF({ ...form, nextAction: e.target.value })} placeholder="e.g. Finish the problem statement" />
            <Input label="Remind me on" type="date" value={form.reminderAt} onChange={(e) => setF({ ...form, reminderAt: e.target.value })} />
            <Textarea label="Notes" rows={4} maxLength={5000} value={form.notes} onChange={(e) => setF({ ...form, notes: e.target.value })} />
            <Link to={`/opportunities/${a.opportunity.id}`} className="text-xs text-accent-500 focus-ring rounded">View opportunity →</Link>
          </div>
          <div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">Timeline</h3>
            <ol className="relative border-l pl-4 space-y-4" style={{ borderColor: 'var(--border)' }}>{(a.timeline ?? []).slice().reverse().map((e) => (
              <li key={e.id}><span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-accent-500" aria-hidden /><p className="text-sm font-medium">{EVENT_LABEL[e.kind] ?? e.kind}</p>{e.detail && <p className="text-xs text-muted">{e.detail.replace('->', '→')}</p>}<time className="text-[11px] text-muted" dateTime={e.createdAt}>{formatDate(e.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></li>))}</ol></div>
        </div>)}
      <Dialog open={confirmDel} onClose={() => setConfirmDel(false)} title="Remove from tracker?" description="The timeline for this application is deleted too." footer={<><Button variant="ghost" onClick={() => setConfirmDel(false)}>Cancel</Button><Button variant="danger" onClick={() => del.mutate()} loading={del.isPending}>Remove</Button></>}><p className="text-sm text-muted">The opportunity itself stays in NIRMAAN.</p></Dialog>
    </Dialog>
  )
}

export function ApplicationsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'board' | 'list'>('board'); const [open, setOpen] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['applications'], queryFn: applicationService.list })
  const ins = useQuery({ queryKey: ['application-insights'], queryFn: applicationService.insights })
  const move = useMutation({ mutationFn: ({ id, s }: { id: string; s: ApplicationStatus }) => applicationService.update(id, { status: s }), onSuccess: () => { toast.success('Status updated'); for (const k of ['applications', 'application-insights', 'dashboard', 'activity']) qc.invalidateQueries({ queryKey: [k] }) }, onError: (e: ApiError) => toast.error(e.message) })
  const d = q.data
  if (q.isLoading) return <div><PageHeader title="Applications" /><div className="grid md:grid-cols-3 gap-4"><Skeleton className="h-48" /><Skeleton className="h-48" /><Skeleton className="h-48" /></div></div>
  if (q.isError || !d) return <div><PageHeader title="Applications" /><ErrorState message={(q.error as Error)?.message} onRetry={() => q.refetch()} /></div>
  const cols = APPLICATION_STATUSES.filter((s) => d.counts[s] > 0 || ['wishlist', 'planning', 'applying', 'applied', 'shortlisted', 'selected'].includes(s))
  return (
    <div>
      <PageHeader title="Applications" subtitle="Your pipeline. Every status change is logged with a real timestamp." actions={<Link to="/opportunities"><Button variant="secondary">Find more</Button></Link>} />
      {(ins.data?.items.length ?? 0) > 0 && <div className="mb-6 grid gap-2">{ins.data!.items.map((i, n) => <Notice key={n} tone={i.kind === 'urgent' ? 'danger' : 'warning'} title={<span className="inline-flex items-center gap-1.5"><AlertTriangle size={13} aria-hidden /> {i.title}</span>}>{i.detail} <button className="underline focus-ring rounded" onClick={() => setOpen(i.applicationId)}>Open</button></Notice>)}</div>}
      {d.total === 0 ? <EmptyState icon={ClipboardList} title="No applications tracked yet" description="Open any opportunity and choose “Track this application”." action={<Link to="/opportunities"><Button>Browse opportunities</Button></Link>} /> : (<>
        <Tabs label="View" value={tab} onChange={setTab} tabs={[{ id: 'board', label: 'Board', count: d.total }, { id: 'list', label: 'List' }]} />
        <div className="mt-4" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'board' ? (
            <div className="flex gap-4 overflow-x-auto pb-4 snap-x">{cols.map((s) => (
              <section key={s} aria-label={titleCase(s)} className="w-72 shrink-0 snap-start"><h2 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 flex items-center justify-between"><StatusPill status={s} /><span className="tabular-nums">{d.counts[s]}</span></h2>
                <div className="space-y-2 min-h-[80px] rounded-xl p-1.5" style={{ background: 'color-mix(in srgb, var(--border) 25%, transparent)' }}>
                  {d.items.filter((a) => a.status === s).map((a) => <AppCard key={a.id} a={a} onOpen={() => setOpen(a.id)} onMove={(st) => move.mutate({ id: a.id, s: st })} moving={move.isPending && move.variables?.id === a.id} />)}
                  {d.counts[s] === 0 && <p className="text-[11px] text-muted text-center py-4">Nothing here</p>}</div></section>))}</div>
          ) : (
            <div className="surface rounded-xl overflow-x-auto"><table className="w-full text-sm min-w-[560px]"><caption className="sr-only">Tracked applications</caption><thead><tr className="text-left text-xs text-muted"><th scope="col" className="p-3">Opportunity</th><th scope="col" className="p-3">Status</th><th scope="col" className="p-3">Deadline</th><th scope="col" className="p-3">Updated</th></tr></thead>
              <tbody>{d.items.map((a) => <tr key={a.id} className="border-t hover:bg-black/[0.02] dark:hover:bg-white/[0.03]" style={{ borderColor: 'var(--border)' }}><td className="p-3"><button onClick={() => setOpen(a.id)} className="text-left font-medium hover:underline focus-ring rounded">{a.opportunity.title}</button><p className="text-xs text-muted">{a.opportunity.organization}</p></td><td className="p-3"><StatusPill status={a.status} /></td><td className="p-3 text-xs">{formatDate(a.opportunity.deadline)}</td><td className="p-3 text-xs text-muted">{timeAgo(a.updatedAt)}</td></tr>)}</tbody></table></div>)}
        </div></>)}
      {open && <Detail id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
