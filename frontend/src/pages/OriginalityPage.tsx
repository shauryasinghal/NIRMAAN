import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ShieldCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input, Textarea } from '../components/ui/Input'
import { Notice, PageHeader, Select } from '../components/ui/kit'
import { IdeaResultView } from '../components/originality/IdeaResultView'
import { ideaService, opportunityService, profileService } from '../lib/services'
import type { ApiError } from '../lib/api'
import type { AiAnalysis, IdeaResult } from '../types'

const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal(''))
const schema = z.object({
  title: z.string().trim().min(3, 'Give your idea a title (3+ characters)').max(200),
  description: z.string().trim().min(20, 'Describe the idea in at least 20 characters').max(5000),
  domain: z.string().optional(),
  problemStatement: opt(1500), objectives: opt(1500), proposedSolution: opt(2500), technologies: opt(400), additionalContext: opt(1500),
})
type Form = z.infer<typeof schema>

type StageState = 'todo' | 'active' | 'done' | 'failed' | 'off'
function Stages({ states }: { states: [StageState, StageState, StageState] }) {
  const labels = ['Understanding your idea', 'Semantic similarity search', 'AI deep analysis']
  const text: Record<StageState, string> = { todo: 'waiting', active: 'in progress', done: 'done', failed: 'could not be completed', off: 'not enabled on this server' }
  return (
    <ol aria-label="Analysis progress" className="grid sm:grid-cols-3 gap-2">
      {labels.map((label, i) => {
        const st = states[i]
        return (
          <li key={label} className={clsx('rounded-lg border p-3 text-xs', st === 'active' ? 'border-accent-500/50' : 'border-[var(--border)]', st === 'off' && 'opacity-60')} aria-current={st === 'active' ? 'step' : undefined}>
            <div className="flex items-center gap-2">
              <span className={clsx('h-5 w-5 rounded-full inline-flex items-center justify-center shrink-0', st === 'done' ? 'bg-success-500/15 text-success-500' : st === 'active' ? 'bg-accent-500/15 text-accent-500' : st === 'failed' ? 'bg-warning-500/15 text-warning-500' : 'bg-black/[0.05] dark:bg-white/[0.08] text-muted')} aria-hidden>
                {st === 'done' ? <Check size={12} /> : st === 'active' ? <span className="h-2 w-2 rounded-full bg-current animate-pulse" /> : <span className="text-[10px]">{i + 1}</span>}
              </span>
              <span className="font-medium">{label}</span>
            </div>
            <p className="text-muted mt-1 ml-7">{text[st]}</p>
          </li>)
      })}
    </ol>
  )
}

export function OriginalityPage() {
  const [sp] = useSearchParams(); const qc = useQueryClient()
  const oppId = sp.get('opportunity')
  const [result, setResult] = useState<IdeaResult | null>(null)
  const [more, setMore] = useState(false)
  const opp = useQuery({ queryKey: ['opportunity', oppId], queryFn: () => opportunityService.detail(oppId!), enabled: !!oppId })
  const interests = useQuery({ queryKey: ['vocab', 'interests'], queryFn: profileService.interests, staleTime: Infinity })
  const status = useQuery({ queryKey: ['originality-status'], queryFn: ideaService.status, staleTime: 5 * 60_000 })
  const aiEnabled = status.data?.ai.enabled ?? false
  const { register, handleSubmit, watch, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema) })

  const ai = useMutation({
    mutationFn: ({ id, force }: { id: string; force: boolean }) => ideaService.aiAnalysis(id, force),
    onSuccess: (a: AiAnalysis) => { setResult((r) => (r ? { ...r, aiAnalysis: a } : r)); qc.invalidateQueries({ queryKey: ['ideas'] }) },
    onError: (e: ApiError) => {
      // The semantic result is already on screen and saved; only the AI stage failed to be reached. Say so in place and offer a retry.
      setResult((r) => (r ? { ...r, aiAnalysis: { status: 'unavailable', provider: r.aiAnalysis?.provider ?? 'Google Gemini', model: r.aiAnalysis?.model ?? null, disclaimer: r.aiAnalysis?.disclaimer ?? '', error: { code: e.code, message: e.message } } } : r))
    },
  })
  const check = useMutation({
    mutationFn: (v: Form) => ideaService.check({
      title: v.title, description: v.description, domain: v.domain || null, opportunityId: oppId,
      problemStatement: v.problemStatement || null, objectives: v.objectives || null, proposedSolution: v.proposedSolution || null, technologies: v.technologies || null, additionalContext: v.additionalContext || null,
    }),
    onSuccess: (r) => {
      setResult(r)
      for (const k of ['ideas', 'dashboard', 'activity', 'notifications']) qc.invalidateQueries({ queryKey: [k] })
      requestAnimationFrame(() => document.getElementById('result')?.focus())
      if (r.aiAnalysis?.status === 'pending') ai.mutate({ id: r.id, force: false })        // stage 3 starts only after stages 1–2 are saved
    },
    onError: (e: ApiError) => { if (e.status !== 503) toast.error(e.message) },
  })
  const desc = watch('description') ?? ''
  const unavailable = check.error && (check.error as ApiError).status === 503
  const stage3: StageState = !aiEnabled && !result?.aiAnalysis ? 'off' : ai.isPending ? 'active' : result?.aiAnalysis?.status === 'completed' ? 'done' : result?.aiAnalysis?.status === 'disabled' ? 'off' : result?.aiAnalysis && result.aiAnalysis.status !== 'pending' ? 'failed' : 'todo'
  const stages: [StageState, StageState, StageState] = check.isPending ? ['done', 'active', aiEnabled ? 'todo' : 'off'] : result ? ['done', 'done', stage3] : ['todo', 'todo', aiEnabled ? 'todo' : 'off']
  const showStages = check.isPending || !!result

  return (
    <div className="max-w-4xl">
      <PageHeader title="Originality check" subtitle="Compare an idea against the corpus using semantic embeddings, then let AI explain what overlaps and what sets yours apart." actions={<Link to="/originality/history" className="text-sm text-accent-500 focus-ring rounded">History</Link>} />
      {opp.data && <div className="mb-5"><Notice tone="accent" title={`Validating an idea for ${opp.data.title}`}>This check will be linked to that opportunity. <Link to={`/opportunities/${opp.data.id}`} className="underline">View it</Link></Notice></div>}
      <Card className="p-5 mb-6">
        <form className="space-y-4" onSubmit={handleSubmit((v) => check.mutate(v))} noValidate>
          <Input label="Idea title" maxLength={200} {...register('title')} error={errors.title?.message} placeholder="e.g. Smart irrigation scheduler for small farms" />
          <div><Textarea label="Describe the idea" rows={6} maxLength={5000} {...register('description')} error={errors.description?.message} placeholder="What problem does it solve, for whom, and how?" /><p className="text-[11px] text-muted mt-1 text-right tabular-nums">{desc.length}/5000</p></div>
          <Select label="Domain (optional)" {...register('domain')}><option value="">Not specified</option>{interests.data?.map((i) => <option key={i.slug}>{i.name}</option>)}</Select>
          <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div><p className="text-sm font-medium">Structured detail <span className="text-muted font-normal">(optional)</span></p><p className="text-xs text-muted mt-0.5">Problem, objectives, solution and technologies are compared too, and they give the AI analysis much more to work with.</p></div>
              <Button type="button" variant="secondary" size="sm" onClick={() => setMore((m) => !m)} aria-expanded={more} aria-controls="structured-detail">{more ? 'Hide' : 'Add detail'}</Button>
            </div>
            {more && (
              <div id="structured-detail" className="space-y-3 mt-4">
                <Textarea label="Problem statement" rows={3} maxLength={1500} {...register('problemStatement')} error={errors.problemStatement?.message} placeholder="What exactly is the problem, and who has it?" />
                <Textarea label="Objectives" rows={3} maxLength={1500} {...register('objectives')} error={errors.objectives?.message} placeholder="What will the project achieve?" />
                <Textarea label="Proposed solution" rows={4} maxLength={2500} {...register('proposedSolution')} error={errors.proposedSolution?.message} placeholder="How does it work? What are the main features?" />
                <Input label="Technologies used" maxLength={400} {...register('technologies')} error={errors.technologies?.message} placeholder="e.g. React, FastAPI, Postgres, LoRa sensors" />
                <Textarea label="Additional context" rows={2} maxLength={1500} {...register('additionalContext')} error={errors.additionalContext?.message} placeholder="Anything else a reviewer should know" />
              </div>)}
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-muted max-w-md">Your idea is saved to your history and never shown to other students.{aiEnabled && status.data ? ` For the AI stage, your text and the closest reference ideas are sent to ${status.data.ai.provider}; nothing about you is.` : ''}</p>
            <Button type="submit" loading={check.isPending}><ShieldCheck size={15} /> Check originality</Button>
          </div>
        </form>
      </Card>
      {showStages && <div className="mb-6" aria-live="polite"><Stages states={stages} /></div>}
      {unavailable && <Notice tone="warning" title="Analysis is unavailable right now">The embedding model isn't available on this server, so NIRMAAN won't guess a score. Nothing was saved. Please try again later.</Notice>}
      {result && !check.isPending && (
        <div id="result" tabIndex={-1} className="outline-none" aria-live="polite">
          <h2 className="text-xl font-semibold mb-4">{result.title}</h2>
          <IdeaResultView r={result} onRunAi={(force) => ai.mutate({ id: result.id, force })} aiRunning={ai.isPending} />
        </div>)}
    </div>
  )
}
