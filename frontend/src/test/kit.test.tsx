import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog, FitBadge, Pagination, Tabs, Toggle, DemoBadge } from '../components/ui/kit'

function Harness() {
  const [open, setOpen] = useState(false)
  return (<div><button onClick={() => setOpen(true)}>open</button><Dialog open={open} onClose={() => setOpen(false)} title="Confirm thing" description="Are you sure?" footer={<button>Yes</button>}><input aria-label="note" /></Dialog></div>)
}

describe('Dialog accessibility', () => {
  it('is a labelled modal, traps focus, closes on Escape and restores focus', async () => {
    render(<Harness />)
    const opener = screen.getByText('open'); await userEvent.click(opener)
    const dlg = screen.getByRole('dialog', { name: 'Confirm thing' }); expect(dlg).toHaveAttribute('aria-modal', 'true'); expect(dlg).toHaveAccessibleDescription('Are you sure?')
    expect(screen.getByLabelText('note')).toHaveFocus()                                          // lands on the form field, not the close button
    await userEvent.tab(); expect(screen.getByText('Yes')).toHaveFocus()
    await userEvent.tab(); expect(screen.getByLabelText('Close dialog')).toHaveFocus()            // wraps: focus never escapes
    await userEvent.tab({ shift: true }); expect(screen.getByText('Yes')).toHaveFocus()
    await userEvent.tab({ shift: true }); expect(screen.getByLabelText('note')).toHaveFocus()
    await userEvent.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).toBeNull(); expect(opener).toHaveFocus()
  })
  it('closes on backdrop click but not on inner clicks', async () => {
    const onClose = vi.fn(); render(<Dialog open onClose={onClose} title="T"><p>inside</p></Dialog>)
    await userEvent.click(screen.getByText('inside')); expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('dialog').parentElement!); expect(onClose).toHaveBeenCalled()
  })
})

describe('controls', () => {
  it('Toggle is a labelled switch', async () => {
    const on = vi.fn(); render(<Toggle checked={false} onChange={on} label="Alerts" description="desc" />)
    const sw = screen.getByRole('switch', { name: /alerts/i }); expect(sw).toHaveAttribute('aria-checked', 'false'); await userEvent.click(sw); expect(on).toHaveBeenCalledWith(true)
  })
  it('Tabs support arrow keys and expose selected state', async () => {
    const on = vi.fn(); render(<Tabs label="t" value="a" onChange={on} tabs={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} />)
    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('aria-selected', 'true'); screen.getByRole('tab', { name: 'A' }).focus(); await userEvent.keyboard('{ArrowRight}'); expect(on).toHaveBeenCalledWith('b')
  })
  it('Pagination marks the current page, disables ends and elides gaps', async () => {
    const on = vi.fn(); render(<Pagination page={1} pages={20} onPage={on} />)
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled(); expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page'); expect(screen.getByText('…')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next page' })); expect(on).toHaveBeenCalledWith(2)
  })
  it('Pagination renders nothing for a single page', () => { const { container } = render(<Pagination page={1} pages={1} onPage={() => undefined} />); expect(container).toBeEmptyDOMElement() })
  it('FitBadge is honest about low confidence; DemoBadge explains itself', () => {
    render(<><FitBadge score={72.4} confidence="low" /><DemoBadge /></>)
    expect(screen.getByText('72%')).toBeInTheDocument(); expect(screen.getByText('low conf.')).toBeInTheDocument(); expect(screen.getByText('Demo data').closest('span')).toHaveAttribute('title', expect.stringMatching(/not a live/i))
  })
})
