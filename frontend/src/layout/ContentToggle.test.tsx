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

describe('ContentToggle on a phone', () => {
  it('is an icon in the header, and waits in the bottom-right corner while the page is hidden', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width'), addEventListener() {}, removeEventListener() {} }))
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { top: this.classList.contains('content-toggle-slot') ? 40 : 0, left: this.classList.contains('content-toggle-slot') ? 200 : 0, width: 36, height: 36, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} } as DOMRect
    })
    renderApp('/')

    const button = screen.getByRole('button', { name: 'Hide page' })
    expect(button).toHaveClass('content-toggle-compact')
    expect(button).toHaveStyle({ top: '40px', left: '200px' })

    await userEvent.click(button)
    const show = screen.getByRole('button', { name: 'Show page' })
    expect(show).toHaveClass('content-toggle-cornered')
    expect(show.style.top).toBe('')

    await userEvent.click(show)
    // Back over its slot at once (it used to wait for a scroll).
    expect(screen.getByRole('button', { name: 'Hide page' })).toHaveStyle({ top: '40px', left: '200px' })
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
})
