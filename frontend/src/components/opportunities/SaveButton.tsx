import { Bookmark } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { savedService } from '../../lib/services'
import clsx from 'clsx'

export function SaveButton({ opportunityId, size = 16 }: { opportunityId: string; size?: number }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['saved-status', opportunityId],
    queryFn: () => savedService.isSaved(opportunityId),
  })
  const saved = data?.saved ?? false

  const mutation = useMutation({
    mutationFn: () => (saved ? savedService.unsave(opportunityId) : savedService.save(opportunityId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-status', opportunityId] })
      qc.invalidateQueries({ queryKey: ['saved-opportunities'] })
      qc.invalidateQueries({ queryKey: ['activity'] })
    },
  })

  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); mutation.mutate() }}
      disabled={mutation.isPending}
      aria-label={saved ? 'Remove from saved' : 'Save opportunity'}
      aria-pressed={saved}
      className={clsx(
        'inline-flex items-center justify-center h-8 w-8 rounded-lg transition-colors shrink-0',
        saved ? 'text-accent-500 bg-accent-500/10' : 'text-muted hover:bg-black/[0.05] dark:hover:bg-white/[0.08]',
      )}
    >
      <motion.span initial={false} animate={{ scale: saved ? [1, 1.25, 1] : 1 }} transition={{ duration: 0.25 }}>
        <Bookmark size={size} fill={saved ? 'currentColor' : 'none'} />
      </motion.span>
    </button>
  )
}
