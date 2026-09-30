import { Bookmark, BookmarkCheck } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { savedService } from '../../lib/services'
import type { ApiError } from '../../lib/api'

export function SaveButton({ id, saved, compact = false }: { id: string; saved: boolean; compact?: boolean }) {
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: () => (saved ? savedService.unsave(id) : savedService.save(id)),
    onSuccess: () => {
      toast.success(saved ? 'Removed from saved' : 'Saved')
      for (const k of ['opportunities', 'opportunity', 'saved', 'dashboard', 'recommendations', 'activity']) qc.invalidateQueries({ queryKey: [k] })
    },
    onError: (e: ApiError) => toast.error(e.message),
  })
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); m.mutate() }} disabled={m.isPending} aria-pressed={saved}
      aria-label={saved ? 'Remove from saved' : 'Save opportunity'}
      className={clsx('inline-flex items-center gap-1.5 rounded-lg text-xs font-medium focus-ring disabled:opacity-60 transition-colors',
        compact ? 'p-2 min-h-[36px] min-w-[36px] justify-center' : 'px-3 py-2', saved ? 'text-accent-500 bg-accent-500/10' : 'text-muted hover:bg-black/[0.05] dark:hover:bg-white/[0.08]')}>
      {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
      {!compact && (saved ? 'Saved' : 'Save')}
    </button>
  )
}
