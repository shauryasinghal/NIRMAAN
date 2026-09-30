import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { GitCompare, Trophy, X } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/primitives'
import { DemoBadge, FitBadge, Notice, PageHeader } from '../components/ui/kit'
import { SaveButton } from '../components/opportunities/SaveButton'
import { opportunityService } from '../lib/services'
import { deadlineLabel, formatDate, money, titleCase } from '../lib/format'

export function ComparePage() {
  const [sp, setSp] = useSearchParams(); const nav = useNavigate()
  const ids = (sp.get('ids') ?? '').split(',').filter(Boolean).slice(0, 4)
  const q = useQuery({ queryKey: ['compare', ids.join(',')], queryFn: () => opportunityService.compare(ids), enabled: ids.length >= 2, retry: false })
  const remove = (id: string) => setSp({ ids: ids.filter((x) => x !== id).join(',') }, { replace: true })

  if (ids.length < 2) return <div><PageHeader title="Compare" /><EmptyState icon={GitCompare} title="Pick 2–4 opportunities to compare" description={ids.length === 1 ? 'You have one selected. Add at least one more from the Opportunities page.' : 'Tick “Compare” on cards in Opportunities.'} action={<Link to="/opportunities"><Button>Browse opportunities</Button></Link>} /></div>
  if (q.isLoading) return <div><PageHeader title="Compare" /><Skeleton className="h-96 w-full" /></div>
  if (q.isError || !q.data) return <div><PageHeader title="Compare" /><ErrorState message={(q.error as Error)?.message} onRetry={() => q.refetch()} /></div>
  const { items, strongest } = q.data
  const rows: [string, (o: (typeof items)[number]) => React.ReactNode][] = [
    ['Deadline', (o) => <span className={o.urgency === 'critical' ? 'text-danger-500 font-medium' : ''}>{formatDate(o.deadline)}<br /><span className="text-xs text-muted">{deadlineLabel(o.daysRemaining, o.urgency)}</span></span>],
    ['Difficulty', (o) => (o.difficulty ? titleCase(o.difficulty) : 'Not listed')], ['Format', (o) => [o.format, o.workMode].filter(Boolean).map((x) => titleCase(x!)).join(' · ') || 'Not listed'],
    ['Participation', (o) => (o.participation ? `${titleCase(o.participation)}${o.minTeamSize ? ` (${o.minTeamSize}${o.maxTeamSize ? `–${o.maxTeamSize}` : '+'})` : ''}` : 'Not listed')], ['Location', (o) => o.location ?? 'Not listed'],
    ['Pay / prize', (o) => [o.prizeText, money(o.stipendAmount, o.stipendCurrency), o.salaryText].filter(Boolean).join(' · ') || 'Not listed'],
    ['Required skills', (o) => <span className="flex flex-wrap gap-1">{o.requiredSkills.length ? o.requiredSkills.map((s) => <span key={s} className={`text-[11px] px-1.5 py-0.5 rounded-full border capitalize ${o.fit?.matchedSkills.includes(s) ? 'border-success-500/40 text-success-500' : 'border-[var(--border)] text-muted'}`}>{o.fit?.matchedSkills.includes(s) ? '✓ ' : ''}{s}</span>) : 'Not listed'}</span>],
    ['Skills you\'re missing', (o) => o.fit?.missingSkills.length ? o.fit.missingSkills.join(', ') : o.requiredSkills.length ? 'None' : 'n/a'],
    ['Main concern', (o) => o.fit?.concerns[0] ?? 'None found'], ['Source', (o) => (o.isDemo ? 'Demo data' : o.source)],
  ]
  return (
    <div>
      <PageHeader title="Compare opportunities" subtitle={`${items.length} side by side, scored for you.`} actions={<Button variant="secondary" onClick={() => nav('/opportunities')}>Add more</Button>} />
      {strongest && <div className="mb-6"><Notice tone="success" title={<span className="inline-flex items-center gap-1.5"><Trophy size={14} aria-hidden /> Strongest match: {strongest.title}</span>}>{strongest.reason}</Notice></div>}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm border-collapse">
          <caption className="sr-only">Comparison of selected opportunities</caption>
          <thead><tr><th className="w-36 p-3" scope="col"><span className="sr-only">Attribute</span></th>{items.map((o) => (
            <th key={o.id} scope="col" className="p-3 text-left align-top min-w-[180px]"><div className="flex items-start justify-between gap-2"><div className="min-w-0">
              <Link to={`/opportunities/${o.id}`} className="font-semibold hover:underline focus-ring rounded">{o.title}</Link><p className="text-xs text-muted font-normal">{o.organization}</p>{o.isDemo && <DemoBadge className="mt-1" />}</div>
              <button onClick={() => remove(o.id)} className="p-1 text-muted hover:text-danger-500 focus-ring rounded" aria-label={`Remove ${o.title} from comparison`}><X size={14} /></button></div></th>))}</tr></thead>
          <tbody>
            <tr className="border-t" style={{ borderColor: 'var(--border)' }}><th scope="row" className="p-3 text-left text-xs text-muted font-medium">Your fit</th>{items.map((o) => <td key={o.id} className="p-3">{o.fit && <FitBadge score={o.fit.overall} confidence={o.fit.confidence} />}{strongest?.id === o.id && <span className="ml-2 text-[11px] text-success-500 font-medium">Best</span>}</td>)}</tr>
            {rows.map(([label, cell]) => <tr key={label} className="border-t" style={{ borderColor: 'var(--border)' }}><th scope="row" className="p-3 text-left text-xs text-muted font-medium align-top">{label}</th>{items.map((o) => <td key={o.id} className="p-3 align-top">{cell(o)}</td>)}</tr>)}
            <tr className="border-t" style={{ borderColor: 'var(--border)' }}><th scope="row" className="p-3"><span className="sr-only">Actions</span></th>{items.map((o) => <td key={o.id} className="p-3"><SaveButton id={o.id} saved={o.saved} /></td>)}</tr>
          </tbody>
        </table>
      </Card>
    </div>
  )
}
