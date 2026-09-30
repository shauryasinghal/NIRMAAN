import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '../components/ui/Button'

describe('Button', () => {
  it('renders its label and responds to clicks', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save changes</Button>)
    const btn = screen.getByRole('button', { name: 'Save changes' })
    await userEvent.click(btn)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is disabled and unclickable while loading', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick} loading>Save changes</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    await userEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })
})
