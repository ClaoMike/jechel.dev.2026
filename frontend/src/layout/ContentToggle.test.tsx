import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/render'
import { ContentToggle, IDLE_MS } from './ContentToggle'

afterEach(() => vi.useRealTimers())

describe('ContentToggle in the layout', () => {
  it('is only offered in the Vice theme', async () => {
    renderApp('/')
    expect(screen.getByRole('button', { name: 'Hide page' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'Dark mode' }))
    expect(screen.queryByRole('button', { name: 'Hide page' })).not.toBeInTheDocument()
  })

  it('hides the page, and brings it back with the button or Escape', async () => {
    renderApp('/')
    const header = document.querySelector('.site-header')!
    const main = screen.getByRole('main', { hidden: true })

    await userEvent.click(screen.getByRole('button', { name: 'Hide page' }))
    expect(header).toHaveAttribute('inert')
    expect(main).toHaveAttribute('inert')
    expect(document.documentElement).toHaveClass('content-hidden')

    await userEvent.click(screen.getByRole('button', { name: 'Show page' }))
    expect(main).not.toHaveAttribute('inert')
    expect(document.documentElement).not.toHaveClass('content-hidden')

    await userEvent.click(screen.getByRole('button', { name: 'Hide page' }))
    await userEvent.keyboard('{Escape}')
    expect(main).not.toHaveAttribute('inert')
  })
})

describe('ContentToggle while the page is hidden', () => {
  it('fades out with the cursor when nothing moves, and comes back on movement', () => {
    vi.useFakeTimers()
    render(<ContentToggle hidden onToggle={() => {}} />)
    const button = screen.getByRole('button', { name: 'Show page' })

    act(() => vi.advanceTimersByTime(IDLE_MS - 100))
    expect(button).not.toHaveClass('content-toggle-idle')
    act(() => vi.advanceTimersByTime(200))
    expect(button).toHaveClass('content-toggle-idle')
    expect(document.documentElement).toHaveClass('scene-idle')

    fireEvent.pointerMove(window)
    expect(button).not.toHaveClass('content-toggle-idle')
    expect(document.documentElement).not.toHaveClass('scene-idle')
  })

  it('never fades while the page is showing', () => {
    vi.useFakeTimers()
    render(<ContentToggle hidden={false} onToggle={() => {}} />)

    act(() => vi.advanceTimersByTime(IDLE_MS * 2))
    expect(screen.getByRole('button', { name: 'Hide page' })).not.toHaveClass('content-toggle-idle')
  })
})
