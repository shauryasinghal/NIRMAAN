import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Scale } from 'lucide-react'
import { opportunityService } from '../lib/services'
import { Card } from '../components/ui/Card'
import { Badge, SkeletonCard, EmptyState } from '../components/ui/primitives'

export function ComparePage() {
  const [params] = useSearchParams()
  const ids = (params.get('ids') || '').split(',').filter(Boolean)

  const recsQ = useQuery({ queryKey: ['recommend', 50], queryFn: () => opportunityService.recommend(50) })
  const opps = useMemo(() => (recsQ.data?.items ?? []).filter((o) => ids.includes(o.id)), [recsQ.data, ids])

  if (recsQ.isLoading) return <SkeletonCard />

  if (ids.length < 2 || opps.length < 2) {
    return (
      <div>
        <Link to="/opportunities" className="text-sm text-muted flex items-center gap-1 mb-4"><ArrowLeft size={14} /> Back to opportunities</Link>
        <EmptyState icon={Scale} title="Select 2–4 opportunities to compare" description="Use the compare checkboxes on the Opportunities page." />
      </div>
    )
  }

  const best = opps.reduce((a, b) => (b.fitScore > a.fitScore ? b : a))
  const latestDeadline = opps.reduce((a, b) => ((b.daysRemaining ?? -1) > (a.daysRemaining ?? -1) ? b : a))

  const rows: { label: string; render: (o: typeof opps[number]) => React.ReactNode }[] = [
    { label: 'NIRMAAN fit', render: (o) => <span className="font-semibold text-accent-500">{o.fitScore}%</span> },
    { label: 'Category', render: (o) => o.category || '—' },
    { label: 'Domain', render: (o) => o.domain },
    { label: 'Deadline', render: (o) => o.deadline || 'TBD' },
    { label: 'Matched skills', render: (o) => o.matchedSkills.length },
    { label: 'Missing skills', render: (o) => o.missingSkills.length },
    { label: 'Participation', render: (o) => o.participation || '—' },
    { label: 'Format', render: (o) => o.format },
    { label: 'Source', render: (o) => <Badge tone={o.sourceType === 'official' ? 'success' : 'neutral'}>{o.sourceType}</Badge> },
  ]

  return (
    <div>
      <Link to="/opportunities" className="text-sm text-muted flex items-center gap-1 mb-4"><ArrowLeft size={14} /> Back to opportunities</Link>
      <h1 className="text-2xl font-semibold mb-1">Compare opportunities</h1>
      <p className="text-muted text-sm mb-6">Side-by-side, using your real fit scores and profile match.</p>

      <Card variant="highlight" className="p-4 mb-6">
        <p className="text-sm">
          <span className="font-medium">{best.title}</span> is the strongest match at {best.fitScore}% fit
          {best.id !== latestDeadline.id && latestDeadline.daysRemaining != null && (
            <> — though <span className="font-medium">{latestDeadline.title}</span> gives you {latestDeadline.daysRemaining} more days before its deadline.</>
          )}
        </p>
      </Card>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left text-xs text-muted font-normal py-2 pr-4 w-32">​</th>
              {opps.map((o) => (
                <th key={o.id} className="text-left py-2 px-3 min-w-[160px]">
                  <Link to={`/opportunities/${o.id}`} className="font-medium hover:text-accent-500 line-clamp-2">{o.title}</Link>
                  <div className="text-[11px] text-muted font-normal mt-0.5">{o.organization}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="py-2.5 pr-4 text-xs text-muted">{row.label}</td>
                {opps.map((o) => <td key={o.id} className="py-2.5 px-3">{row.render(o)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
