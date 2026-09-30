import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card } from '../components/ui/Card'
import { Badge, ErrorState, Skeleton } from '../components/ui/primitives'
import { Dialog, Notice, PageHeader, Pagination, Select, Tabs } from '../components/ui/kit'
import { useAuth } from '../context/AuthContext'
import { adminService } from '../lib/services'
import { formatDate, timeAgo } from '../lib/format'
import type { ApiError } from '../lib/api'
import type { AdminUser, Role } from '../types'

function Users() {
  const { me } = useAuth(); const qc = useQueryClient()
  const [q, setQ] = useState(''); const [dq, setDq] = useState(''); const [role, setRole] = useState(''); const [page, setPage] = useState(1)
  const [target, setTarget] = useState<{ user: AdminUser; role: Role } | null>(null)
  useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [q])
  const users = useQuery({ queryKey: ['admin-users', dq, role, page], queryFn: () => adminService.users(dq, role, page), placeholderData: keepPreviousData })
  const set = useMutation({ mutationFn: () => adminService.setRole(target!.user.id, target!.role), onSuccess: () => { toast.success('Role updated and audited'); setTarget(null); for (const k of ['admin-users', 'admin-audit']) qc.invalidateQueries({ queryKey: [k] }) }, onError: (e: ApiError) => { toast.error(e.message); setTarget(null) } })
  return (<div>
    <div className="flex flex-wrap gap-3 mb-4"><div className="w-64"><Input aria-label="Search users" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} /></div><div className="w-40"><Select aria-label="Filter by role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }}><option value="">All roles</option><option value="student">Students</option><option value="reviewer">Reviewers</option><option value="admin">Admins</option></Select></div></div>
    {users.isLoading ? <Skeleton className="h-48 w-full" /> : users.isError ? <ErrorState message={(users.error as Error).message} onRetry={() => users.refetch()} /> : (<>
      <div className="surface rounded-xl overflow-x-auto"><table className="w-full text-sm min-w-[600px]"><caption className="sr-only">Users</caption><thead><tr className="text-left text-xs text-muted"><th scope="col" className="p-3">User</th><th scope="col" className="p-3">Joined</th><th scope="col" className="p-3">Role</th></tr></thead>
        <tbody>{users.data?.items.map((u) => (<tr key={u.id} className="border-t" style={{ borderColor: 'var(--border)' }}><td className="p-3"><p className="font-medium">{u.fullName || '—'}{u.id === me?.id && <span className="text-muted font-normal"> (you)</span>}</p><p className="text-xs text-muted">{u.email}</p></td><td className="p-3 text-xs text-muted">{formatDate(u.createdAt)}</td>
          <td className="p-3"><Select aria-label={`Role for ${u.email}`} value={u.role} onChange={(e) => setTarget({ user: u, role: e.target.value as Role })} className="!py-1 text-xs w-32"><option value="student">Student</option><option value="reviewer">Reviewer</option><option value="admin">Admin</option></Select></td></tr>))}</tbody></table></div>
      <Pagination page={users.data!.page} pages={Math.max(1, Math.ceil(users.data!.total / users.data!.pageSize))} onPage={setPage} /></>)}
    <Dialog open={!!target} onClose={() => setTarget(null)} title="Change role?" description={target ? `${target.user.email}: ${target.user.role} → ${target.role}` : undefined} footer={<><Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button><Button onClick={() => set.mutate()} loading={set.isPending}>Change role</Button></>}><p className="text-sm text-muted">This is recorded in the audit log with your account. The last administrator can't be demoted.</p></Dialog>
  </div>)
}

function Audit() {
  const [page, setPage] = useState(1); const [action, setAction] = useState('')
  const q = useQuery({ queryKey: ['admin-audit', action, page], queryFn: () => adminService.audit(action, page), placeholderData: keepPreviousData })
  return (<div>
    <div className="w-56 mb-4"><Select aria-label="Filter by action" value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }}><option value="">All actions</option><option value="role_changed">Role changes</option><option value="review_decision">Review decisions</option></Select></div>
    {q.isLoading ? <Skeleton className="h-48 w-full" /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} /> : !q.data?.items.length ? <Notice>No audit entries yet.</Notice> : (<>
      <div className="surface rounded-xl overflow-x-auto"><table className="w-full text-sm min-w-[640px]"><caption className="sr-only">Audit log</caption><thead><tr className="text-left text-xs text-muted"><th scope="col" className="p-3">When</th><th scope="col" className="p-3">Actor</th><th scope="col" className="p-3">Action</th><th scope="col" className="p-3">Detail</th></tr></thead>
        <tbody>{q.data.items.map((a) => <tr key={a.id} className="border-t align-top" style={{ borderColor: 'var(--border)' }}><td className="p-3 text-xs whitespace-nowrap">{formatDate(a.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td><td className="p-3 text-xs">{a.actor ?? 'system'}</td><td className="p-3"><Badge>{a.action.replace(/_/g, ' ')}</Badge></td><td className="p-3 text-xs text-muted font-mono break-all">{JSON.stringify(a.detail)}</td></tr>)}</tbody></table></div>
      <Pagination page={q.data.page} pages={Math.max(1, Math.ceil(q.data.total / q.data.pageSize))} onPage={setPage} /></>)}
  </div>)
}

function Ingestion() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin-ingestion'], queryFn: adminService.ingestion })
  const run = useMutation({ mutationFn: (s: string) => adminService.runIngestion(s), onSuccess: (r) => { toast.success(`Ingestion finished: ${String(r.inserted ?? 0)} new, ${String(r.updated ?? 0)} updated`); qc.invalidateQueries({ queryKey: ['admin-ingestion'] }) }, onError: (e: ApiError) => toast.error(e.message) })
  if (q.isLoading) return <Skeleton className="h-48 w-full" />
  if (q.isError || !q.data) return <ErrorState message={(q.error as Error)?.message} onRetry={() => q.refetch()} />
  return (<div className="space-y-6">
    <Notice title="Sources are opt-in">Real sources stay disabled until someone has reviewed their terms and robots.txt. Fetching honours robots.txt, rate limits and size caps.</Notice>
    <div className="grid md:grid-cols-2 gap-4">{q.data.sources.length === 0 ? <p className="text-sm text-muted">No sources registered yet.</p> : q.data.sources.map((s) => <Card key={s.key} className="p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-medium text-sm">{s.name}</p><p className="text-xs text-muted">{s.key} · {s.kind}</p></div><Badge tone={s.enabled ? 'success' : 'warning'}>{s.enabled ? 'enabled' : 'disabled'}</Badge></div><p className="text-xs text-muted mt-2">{s.lastRunAt ? `Last run ${timeAgo(s.lastRunAt)}` : 'Never run'}</p>{s.key === 'dev-fixtures' && <Button size="sm" variant="secondary" className="mt-3" onClick={() => run.mutate(s.key)} loading={run.isPending}>Run now</Button>}</Card>)}</div>
    <div><h2 className="text-sm font-semibold mb-2">Recent runs</h2>{q.data.runs.length === 0 ? <p className="text-sm text-muted">No runs yet.</p> : <div className="surface rounded-xl overflow-x-auto"><table className="w-full text-sm min-w-[600px]"><caption className="sr-only">Ingestion runs</caption><thead><tr className="text-left text-xs text-muted"><th scope="col" className="p-3">Source</th><th scope="col" className="p-3">Status</th><th scope="col" className="p-3">Fetched</th><th scope="col" className="p-3">New</th><th scope="col" className="p-3">Updated</th><th scope="col" className="p-3">Duplicates</th><th scope="col" className="p-3">Rejected</th><th scope="col" className="p-3">When</th></tr></thead><tbody>{q.data.runs.map((r) => <tr key={r.id} className="border-t tabular-nums" style={{ borderColor: 'var(--border)' }}><td className="p-3">{r.source}</td><td className="p-3"><Badge tone={r.status === 'succeeded' ? 'success' : r.status === 'failed' ? 'danger' : 'warning'}>{r.status}</Badge></td><td className="p-3">{r.fetched}</td><td className="p-3">{r.inserted}</td><td className="p-3">{r.updated}</td><td className="p-3">{r.duplicates}</td><td className="p-3">{r.rejected}</td><td className="p-3 text-xs text-muted">{timeAgo(r.startedAt)}</td></tr>)}</tbody></table></div>}</div>
  </div>)
}

export function AdminPage() {
  const [tab, setTab] = useState<'users' | 'audit' | 'ingestion'>('users')
  return (<div><PageHeader title="Admin" subtitle="Roles, audit log and data ingestion. Everything here is enforced by the API and the database, not by this screen." />
    <Tabs label="Admin sections" value={tab} onChange={setTab} tabs={[{ id: 'users', label: 'Users & roles' }, { id: 'audit', label: 'Audit log' }, { id: 'ingestion', label: 'Ingestion' }]} />
    <div className="mt-5" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>{tab === 'users' ? <Users /> : tab === 'audit' ? <Audit /> : <Ingestion />}</div></div>)
}
