import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Target } from 'lucide-react'
import { originalityService } from '../lib/services'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input, Textarea } from '../components/ui/Input'
import { ScoreRing, Badge, ProcessingState } from '../components/ui/primitives'

const STATUS_LABEL: Record<string, string> = {
  novel: 'High novelty', worth_reviewing: 'Worth reviewing', needs_review: 'Human review recommended',
}
const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  novel: 'success', worth_reviewing: 'warning', needs_review: 'danger',
}

export function OriginalityPage() {
  const [params] = useSearchParams()
  const opportunityId = params.get('opportunityId')
  const domain = params.get('domain') || undefined

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const mutation = useMutation({
    mutationFn: () => originalityService.check({ title, description, domain }),
  })

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Validate your idea before you build it.</h1>
      <p className="text-muted text-sm mb-6">Semantic similarity against the indexed prior-idea corpus — a screening signal, not proof of plagiarism.</p>

      {opportunityId && (
        <Card variant="highlight" className="p-4 mb-6 flex items-start gap-3">
          <Target size={16} className="text-accent-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Validating for a specific opportunity</p>
            <p className="text-xs text-muted mt-0.5">
              Checking against the <span className="font-medium">{domain}</span> domain for{' '}
              <Link to={`/opportunities/${opportunityId}`} className="text-accent-500 hover:underline">this opportunity</Link>.
            </p>
          </div>
        </Card>
      )}

      <Card variant="elevated" className="p-5 mb-6 space-y-3">
        <Input label="Idea title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Hackathon teammate matcher" />
        <Textarea label="Idea description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what the idea does…" />
        <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!title.trim() || !description.trim()}>
          Check originality
        </Button>
      </Card>

      {mutation.isPending && (
        <ProcessingState label="Generating a semantic representation and searching prior ideas via FAISS…" />
      )}
      {mutation.isError && <p className="text-sm text-danger-500">{(mutation.error as Error).message}</p>}

      {mutation.data && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
        <Card variant="elevated" className="p-6">
          <div className="flex items-center gap-5 mb-6">
            <ScoreRing value={mutation.data.noveltyScore} label="novelty" />
            <div>
              <Badge tone={STATUS_TONE[mutation.data.status] ?? 'neutral'}>{STATUS_LABEL[mutation.data.status] ?? mutation.data.status}</Badge>
              <p className="text-xs text-muted mt-2">
                Embedding: {mutation.data.embeddingMode} · Search: {mutation.data.searchBackend}
              </p>
            </div>
          </div>

          <h3 className="text-sm font-medium mb-3">Closest matches</h3>
          {mutation.data.matches.length === 0 && <p className="text-sm text-muted">No similar prior ideas found in the corpus.</p>}
          <div className="space-y-2">
            {mutation.data.matches.map((m) => (
              <div key={m.id} className="border rounded-lg p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{m.title}</span>
                  <span className="text-accent-500">{m.similarity}%</span>
                </div>
                <p className="text-xs text-muted mt-1">{m.description}</p>
                <p className="text-[10px] text-muted mt-1">{m.source}</p>
              </div>
            ))}
          </div>
        </Card>
        </motion.div>
      )}
    </div>
  )
}
