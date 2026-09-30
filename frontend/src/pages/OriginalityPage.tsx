import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input, Textarea } from '../components/ui/Input'
import { ProcessingState } from '../components/ui/primitives'
import { Notice, PageHeader, Select } from '../components/ui/kit'
import { IdeaResultView } from '../components/originality/IdeaResultView'
import { ideaService, opportunityService, profileService } from '../lib/services'
import type { ApiError } from '../lib/api'
import type { IdeaResult } from '../types'

const schema = z.object({ title: z.string().trim().min(3, 'Give your idea a title (3+ characters)').max(200), description: z.string().trim().min(20, 'Describe the idea in at least 20 characters').max(5000), domain: z.string().optional() })
type Form = z.infer<typeof schema>

export function OriginalityPage() {
  const [sp] = useSearchParams(); const qc = useQueryClient()
  const oppId = sp.get('opportunity')
  const [result, setResult] = useState<IdeaResult | null>(null)
  const opp = useQuery({ queryKey: ['opportunity', oppId], queryFn: () => opportunityService.detail(oppId!), enabled: !!oppId })
  const interests = useQuery({ queryKey: ['vocab', 'interests'], queryFn: profileService.interests, staleTime: Infinity })
  const { register, handleSubmit, watch, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema) })
  const check = useMutation({
    mutationFn: (v: Form) => ideaService.check({ title: v.title, description: v.description, domain: v.domain || null, opportunityId: oppId }),
    onSuccess: (r) => { setResult(r); for (const k of ['ideas', 'dashboard', 'activity', 'notifications']) qc.invalidateQueries({ queryKey: [k] }); requestAnimationFrame(() => document.getElementById('result')?.focus()) },
    onError: (e: ApiError) => { if (e.status !== 503) toast.error(e.message) },
  })
  const desc = watch('description') ?? ''
  const unavailable = check.error && (check.error as ApiError).status === 503
  return (
    <div className="max-w-4xl">
      <PageHeader title="Originality check" subtitle="Compare an idea against the corpus using semantic embeddings before you invest weeks in it." actions={<Link to="/originality/history" className="text-sm text-accent-500 focus-ring rounded">History</Link>} />
      {opp.data && <div className="mb-5"><Notice tone="accent" title={`Validating an idea for ${opp.data.title}`}>This check will be linked to that opportunity. <Link to={`/opportunities/${opp.data.id}`} className="underline">View it</Link></Notice></div>}
      <Card className="p-5 mb-6">
        <form className="space-y-4" onSubmit={handleSubmit((v) => check.mutate(v))} noValidate>
          <Input label="Idea title" maxLength={200} {...register('title')} error={errors.title?.message} placeholder="e.g. Smart irrigation scheduler for small farms" />
          <div><Textarea label="Describe the idea" rows={6} maxLength={5000} {...register('description')} error={errors.description?.message} placeholder="What problem does it solve, for whom, and how?" /><p className="text-[11px] text-muted mt-1 text-right tabular-nums">{desc.length}/5000</p></div>
          <Select label="Domain (optional)" {...register('domain')}><option value="">Not specified</option>{interests.data?.map((i) => <option key={i.slug}>{i.name}</option>)}</Select>
          <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted max-w-md">Your idea is saved to your history. It is never shown to other students.</p><Button type="submit" loading={check.isPending}><ShieldCheck size={15} /> Check originality</Button></div>
        </form>
      </Card>
      {check.isPending && <ProcessingState label="Embedding your idea and searching the corpus…" />}
      {unavailable && <Notice tone="warning" title="Analysis is unavailable right now">The embedding model isn't available on this server, so NIRMAAN won't guess a score. Nothing was saved. Please try again later.</Notice>}
      {result && !check.isPending && <div id="result" tabIndex={-1} className="outline-none" aria-live="polite"><h2 className="text-xl font-semibold mb-4">{result.title}</h2><IdeaResultView r={result} /></div>}
    </div>
  )
}
