import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Dialog, Notice, PageHeader, Section, Select, Toggle } from '../components/ui/kit'
import { Badge, ErrorState, Skeleton } from '../components/ui/primitives'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { activityService, integrationService, notificationService } from '../lib/services'
import { formatDate } from '../lib/format'
import type { ApiError } from '../lib/api'
import type { NotificationPrefs } from '../types'

export function SettingsPage() {
  const { me, signOut, updatePassword } = useAuth()
  const { mode, setMode } = useTheme()
  const qc = useQueryClient(); const nav = useNavigate()
  const prefs = useQuery({ queryKey: ['notification-prefs'], queryFn: notificationService.prefs })
  const integ = useQuery({ queryKey: ['integrations'], queryFn: integrationService.status })
  const signals = useQuery({ queryKey: ['signals'], queryFn: activityService.signals })
  const [resetOpen, setResetOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pwErr, setPwErr] = useState<string | null>(null)
  const setPrefs = useMutation({ mutationFn: (p: Partial<NotificationPrefs>) => notificationService.setPrefs(p), onSuccess: (d) => qc.setQueryData(['notification-prefs'], d), onError: (e: ApiError) => toast.error(e.message) })
  const connect = useMutation({ mutationFn: (p: 'calendar' | 'gmail') => integrationService.connect(p).then((r) => { sessionStorage.setItem('nirmaan_google_provider', p); window.location.assign(r.authorizationUrl) }), onError: (e: ApiError) => toast.error(e.message) })
  const disconnect = useMutation({ mutationFn: (p: 'calendar' | 'gmail') => integrationService.disconnect(p), onSuccess: () => { toast.success('Disconnected'); qc.invalidateQueries({ queryKey: ['integrations'] }) }, onError: (e: ApiError) => toast.error(e.message) })
  const resetSignals = useMutation({ mutationFn: activityService.resetSignals, onSuccess: () => { toast.success('Behavioural signals cleared'); setResetOpen(false); for (const k of ['signals', 'opportunities', 'dashboard', 'recommendations']) qc.invalidateQueries({ queryKey: [k] }) }, onError: (e: ApiError) => toast.error(e.message) })

  const P = prefs.data
  const rows: [keyof NotificationPrefs, string, string][] = [['highFit', 'High-fit opportunities', 'New listings that score at or above your threshold.'], ['smartAlert', 'Smart alerts', 'Matches for the alerts you created.'], ['deadline', 'Deadlines & reminders', 'Closing soon and your own application reminders.'], ['applicationUpdate', 'Application updates', 'Changes on your tracked applications.'], ['teamEvent', 'Team activity', 'Invitations and responses.'], ['originalityReview', 'Originality & reviews', 'Review queue status and reviewer decisions.']]

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Appearance, notifications, connections and privacy." />
      <Section title="Account"><Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium">{me?.fullName || 'Your account'}</p><p className="text-xs text-muted">{me?.email} · <span className="capitalize">{me?.role}</span></p></div><Button variant="secondary" onClick={async () => { await signOut(); nav('/login') }}>Log out</Button></div>
        <form className="grid sm:grid-cols-[1fr_auto] gap-3 items-end pt-3 border-t" style={{ borderColor: 'var(--border)' }} onSubmit={async (e) => { e.preventDefault(); setPwErr(null); if (pw.length < 8 || !/\d/.test(pw) || !/[A-Za-z]/.test(pw)) { setPwErr('Use at least 8 characters with a letter and a number.'); return } const err = await updatePassword(pw); if (err) setPwErr(err.message); else { toast.success('Password updated'); setPw('') } }}>
          <Input label="Change password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} error={pwErr ?? undefined} placeholder="New password" />
          <Button type="submit" variant="secondary">Update</Button>
        </form></Card></Section>

      <Section title="Appearance"><Card className="p-5"><Select label="Theme" value={mode} onChange={(e) => setMode(e.target.value as 'light' | 'dark' | 'system')}><option value="system">Match my device</option><option value="light">Light</option><option value="dark">Dark</option></Select></Card></Section>

      <Section title="Notifications" hint="Only real events create notifications. Turn off what you don't want.">
        <Card className="p-5">{prefs.isLoading ? <Skeleton className="h-40 w-full" /> : prefs.isError || !P ? <ErrorState onRetry={() => prefs.refetch()} /> : (<>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>{rows.map(([k, l, dsc]) => <Toggle key={k} checked={P[k] as boolean} onChange={(v) => setPrefs.mutate({ [k]: v })} label={l} description={dsc} />)}</div>
          <div className="pt-4 mt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <label htmlFor="minfit" className="block text-sm font-medium">High-fit threshold: <span className="tabular-nums">{Math.round(P.minFitForNotify)}%</span></label>
            <input id="minfit" type="range" min={40} max={100} step={5} value={P.minFitForNotify} onChange={(e) => qc.setQueryData(['notification-prefs'], { ...P, minFitForNotify: Number(e.target.value) })} onMouseUp={(e) => setPrefs.mutate({ minFitForNotify: Number((e.target as HTMLInputElement).value) })} onKeyUp={(e) => setPrefs.mutate({ minFitForNotify: Number((e.target as HTMLInputElement).value) })} onTouchEnd={(e) => setPrefs.mutate({ minFitForNotify: Number((e.target as HTMLInputElement).value) })} className="w-full mt-2 accent-[var(--color-accent-500)]" />
            <p className="text-xs text-muted mt-1">Notify me about new opportunities that fit me at least this well.</p></div></>)}
        </Card></Section>

      <Section title="Connections" hint="Optional. Nothing is added to your calendar or mailbox without you confirming each time.">
        <Card className="p-5 space-y-4">{integ.isLoading ? <Skeleton className="h-24 w-full" /> : integ.isError || !integ.data ? <ErrorState onRetry={() => integ.refetch()} /> : (<>
          {!integ.data.enabled && <Notice tone="warning" title="Google connections are unavailable">{integ.data.reason} Everything else works; the deadline “.ics” download works with any calendar app.</Notice>}
          {(['calendar', 'gmail'] as const).map((p) => { const s = integ.data![p]; const name = p === 'calendar' ? 'Google Calendar' : 'Gmail'
            return (<div key={p} className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">{name} {s.connected && <Badge tone="success">connected</Badge>}</p>
              <p className="text-xs text-muted">{p === 'calendar' ? 'Add deadlines to your calendar (permission: create events).' : 'Email yourself a deadline reminder (permission: send email — nothing else).'}{s.connectedAt && ` Connected ${formatDate(s.connectedAt)}.`}</p></div>
              {s.connected ? <Button variant="secondary" size="sm" onClick={() => disconnect.mutate(p)} loading={disconnect.isPending && disconnect.variables === p}>Disconnect</Button>
                : <Button variant="secondary" size="sm" disabled={!integ.data!.enabled} onClick={() => connect.mutate(p)} loading={connect.isPending && connect.variables === p}>Connect</Button>}</div>) })}</>)}
        </Card></Section>

      <Section title="Privacy: what shapes your recommendations" hint="Your actions nudge rankings. You can see exactly how, and reset it.">
        <Card className="p-5">{signals.isLoading ? <Skeleton className="h-24 w-full" /> : signals.isError || !signals.data ? <ErrorState onRetry={() => signals.refetch()} /> : (<>
          <p className="text-sm text-muted mb-3">{signals.data.explanation}</p>
          <div className="flex flex-wrap gap-2 mb-3">{signals.data.eventCounts.length === 0 ? <span className="text-xs text-muted">No signals recorded yet.</span> : signals.data.eventCounts.map((e) => <Badge key={e.eventType}>{e.eventType.replace(/_/g, ' ')}: {e.n}</Badge>)}</div>
          <p className="text-xs text-muted mb-3">{signals.data.active ? `Active: ${signals.data.usedForRanking} recent actions currently influence your ranking.` : `Not active yet: needs ${signals.data.minEvents} actions (${signals.data.usedForRanking} so far).`}</p>
          <Button variant="secondary" size="sm" onClick={() => setResetOpen(true)} disabled={signals.data.totalEvents === 0}>Reset my signals</Button></>)}
        </Card></Section>

      <Dialog open={resetOpen} onClose={() => setResetOpen(false)} title="Reset personalisation?" description="This deletes your recorded views, saves, comparisons and dismissals used for ranking. Your saved items and applications stay." footer={<><Button variant="ghost" onClick={() => setResetOpen(false)}>Cancel</Button><Button variant="danger" onClick={() => resetSignals.mutate()} loading={resetSignals.isPending}>Delete signals</Button></>}><p className="text-sm text-muted">Dismissed opportunities will reappear.</p></Dialog>
    </div>
  )
}
