import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState, Badge, ScoreRing } from '../components/ui/primitives'
import { Compass } from 'lucide-react'

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState icon={Compass} title="No opportunities found" description="Try a different filter." />)
    expect(screen.getByText('No opportunities found')).toBeInTheDocument()
    expect(screen.getByText('Try a different filter.')).toBeInTheDocument()
  })
})

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge tone="success">Novel</Badge>)
    expect(screen.getByText('Novel')).toBeInTheDocument()
  })
})

describe('ScoreRing', () => {
  it('renders the rounded numeric value', () => {
    render(<ScoreRing value={82.4} label="novelty" />)
    expect(screen.getByText('82')).toBeInTheDocument()
    expect(screen.getByText('novelty')).toBeInTheDocument()
  })
})
