import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopyButton } from './CopyButton'

describe('CopyButton', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is an icon button, labelled for screen readers', () => {
    render(<CopyButton value="x" label="email" />)

    const button = screen.getByRole('button', { name: 'Copy email' })
    expect(button.querySelector('svg')).toBeInTheDocument()
    expect(button).toHaveTextContent(/^$/)
  })

  it('copies the value, announces it, then resets', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<CopyButton value="ada@example.com" label="email" />)

    await user.click(screen.getByRole('button', { name: 'Copy email' }))

    await expect(navigator.clipboard.readText()).resolves.toBe('ada@example.com')
    expect(screen.getByRole('button', { name: 'Copy email' })).toHaveAttribute('title', 'Copied!')
    expect(screen.getByRole('status')).toHaveTextContent('email copied')

    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(screen.getByRole('button', { name: 'Copy email' })).toHaveAttribute('title', 'Copy email to clipboard')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('says so when the clipboard is unavailable', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'))
    render(<CopyButton value="x" label="name" />)

    await user.click(screen.getByRole('button', { name: 'Copy name' }))

    expect(screen.getByRole('button', { name: 'Copy name' })).toHaveAttribute('title', "Couldn't copy")
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't copy name")
  })
})
