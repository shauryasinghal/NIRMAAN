import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bookmark } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, SkeletonCard } from '../components/ui/primitives'
import { PageHeader } from '../components/ui/kit'
import { OpportunityCard } from '../components/opportunities/OpportunityCard'
import { savedService } from '../lib/services'
import type { OpportunityCardData } from '../types'

export function SavedPage() {
  const q = useQuery({ queryKey: ['saved'], queryFn: savedService.list })
  const items = (q.data?.items ?? []) as unknown as OpportunityCardData[]
  return (
    <div>
      <PageHeader title="Saved" subtitle="Opportunities you've bookmarked, with your current fit." />
      {q.isLoading ? <div className="grid md:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
        : items.length === 0 ? <EmptyState icon={Bookmark} title="Nothing saved yet" description="Save opportunities you want to come back to." action={<Link to="/opportunities"><Button>Browse opportunities</Button></Link>} />
        : <div className="grid md:grid-cols-2 gap-4">{items.map((o) => <OpportunityCard key={o.id} o={o} />)}</div>}
    </div>
  )
}
