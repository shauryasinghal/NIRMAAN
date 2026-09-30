import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChipSelector } from '../components/common/ChipSelector'

describe('ChipSelector', () => {
  it('adds an option to selection when clicked', async () => {
    const onChange = vi.fn()
    render(<ChipSelector options={['python', 'react']} selected={[]} onChange={onChange} />)
    await userEvent.click(screen.getByText('Python'))                     // displayed nicely…
    expect(onChange).toHaveBeenCalledWith(['python'])                    // …stored as the lowercase key
  })

  it('removes a selected chip when its remove button is clicked', async () => {
    const onChange = vi.fn()
    render(<ChipSelector options={['python', 'react']} selected={['python']} onChange={onChange} />)
    await userEvent.click(screen.getByLabelText('Remove python'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('adds a custom skill typed by the user', async () => {
    const onChange = vi.fn()
    render(<ChipSelector options={['python']} selected={[]} onChange={onChange} />)
    const input = screen.getByPlaceholderText('Search or add…')
    await userEvent.type(input, 'kubernetes{Enter}')
    expect(onChange).toHaveBeenCalledWith(['kubernetes'])
  })
})
