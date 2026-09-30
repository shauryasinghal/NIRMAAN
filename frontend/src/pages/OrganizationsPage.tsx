import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building2, Search } from 'lucide-react'
import { organizationService } from '../lib/services'
import { Card } from '../components/ui/Card'
import { EmptyState, SkeletonCard } from '../components/ui/primitives'

export function OrganizationsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['organizations'], queryFn: organizationService.list })
  const [query, setQuery] = useState('')

  const items = useMemo(() => {
    const all = data?.items ?? []
    if (!query.trim()) return all
    return all.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()))
  }, [data, query])

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Organizations</h1>
      <p className="text-muted text-sm mb-6">Every organization currently publishing opportunities on NIRMAAN.</p>

      <div className="relative mb-6 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search organizations…"
          className="w-full rounded-lg border pl-9 pr-3 py-2 text-sm bg-transparent focus-ring" style={{ borderColor: 'var(--border)' }}
        />
      </div>

      {isLoading && <div className="grid sm:grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>}
      {!isLoading && items.length === 0 && <EmptyState icon={Building2} title="No organizations found" />}

      <div className="grid sm:grid-cols-2 gap-3">
        {items.map((o) => (
          <Link key={o.name} to={`/organizations/${encodeURIComponent(o.name)}`}>
            <Card variant="interactive" className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent-500/10 flex items-center justify-center text-accent-500 font-semibold shrink-0">
                {o.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{o.name}</div>
                <div className="text-xs text-muted">{o.opportunityCount} opportunit{o.opportunityCount === 1 ? 'y' : 'ies'}</div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
