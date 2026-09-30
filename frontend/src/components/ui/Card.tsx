import type { HTMLAttributes } from 'react'
import clsx from 'clsx'

type Variant = 'surface' | 'elevated' | 'interactive' | 'highlight'

interface Props extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant
}

const variantClass: Record<Variant, string> = {
  surface: 'surface',
  elevated: 'surface-elevated',
  interactive: 'surface-interactive',
  highlight: 'surface-highlight',
}

export function Card({ variant = 'surface', className, ...rest }: Props) {
  return <div className={clsx('rounded-xl', variantClass[variant], className)} {...rest} />
}
