import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/render'

const tabs = () => within(screen.getByRole('navigation', { name: 'Sections' }))

// jsdom has no layout: give each tab a place on a line, 100px wide, in order.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('tab') ? 100 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('tab') ? [...this.parentElement!.querySelectorAll('.tab')].indexOf(this) * 100 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(500)
  HTMLElement.prototype.setPointerCapture = () => {}
})
afterEach(() => vi.restoreAllMocks())

const indicator = () => document.querySelector<HTMLElement>('.tab-indicator')!

describe('TabNav', () => {
  it('puts the highlight under the current tab, and moves it to the one clicked', async () => {
    renderApp('/apps')

    await screen.findByRole('heading', { name: 'Apps' })
    expect(indicator().style.transform).toBe('translateX(100px)')
    fireEvent.click(tabs().getByRole('link', { name: 'About Me' }))

    await screen.findByRole('region', { name: 'Skills' })
    expect(indicator().style.transform).toBe('translateX(300px)')
  })

  it('opens the tab the highlight is dragged to', async () => {
    renderApp('/')
    await screen.findByRole('heading', { name: "What's new?" })
    const current = tabs().getByRole('link', { name: "What's new?" })

    fireEvent.pointerDown(current, { pointerId: 1, isPrimary: true, button: 0, clientX: 50 })
    fireEvent.pointerMove(current, { pointerId: 1, isPrimary: true, clientX: 160 })
    expect(indicator().style.transform).toBe('translateX(110px)')
    fireEvent.pointerMove(current, { pointerId: 1, isPrimary: true, clientX: 240 })
    fireEvent.pointerUp(current, { pointerId: 1, isPrimary: true, clientX: 240 })
    // The click that ends a drag doesn't open the tab it started on.
    fireEvent.click(current)

    expect(await screen.findByRole('link', { name: 'YouTube', current: 'page' })).toBeInTheDocument()
  })

  it('a tap on the current tab is just a tap', async () => {
    renderApp('/apps')
    await screen.findByRole('heading', { name: 'Apps' })
    const current = tabs().getByRole('link', { name: 'Apps' })

    fireEvent.pointerDown(current, { pointerId: 1, isPrimary: true, button: 0, clientX: 150 })
    fireEvent.pointerMove(current, { pointerId: 1, isPrimary: true, clientX: 152 })
    fireEvent.pointerUp(current, { pointerId: 1, isPrimary: true, clientX: 152 })

    expect(tabs().getByRole('link', { name: 'Apps' })).toHaveAttribute('aria-current', 'page')
    expect(indicator().style.transform).toBe('translateX(100px)')
  })

  it('shows arrows at the ends when tabs are out of view, and they scroll the bar', async () => {
    // A bar 250px wide showing 500px of tabs, scrolled to the start.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('tabs') ? 250 : 0
    })
    const scrollBy = vi.fn()
    HTMLElement.prototype.scrollBy = scrollBy
    renderApp('/')
    await screen.findByRole('heading', { name: "What's new?" })

    const frame = document.querySelector('.tabs-frame')!
    expect(frame.querySelector('.tabs-arrow-left')).toBeNull()
    const right = frame.querySelector<HTMLButtonElement>('.tabs-arrow-right')!
    // Out of the way of keyboards and screen readers: every tab is reachable with Tab.
    expect(right).toHaveAttribute('tabindex', '-1')
    expect(right).toHaveAttribute('aria-hidden', 'true')

    fireEvent.click(right)
    expect(scrollBy).toHaveBeenCalledWith({ left: 175, behavior: 'smooth' })

    const nav = screen.getByRole('navigation', { name: 'Sections' })
    Object.defineProperty(nav, 'scrollLeft', { value: 250, configurable: true })
    fireEvent.scroll(nav)
    expect(frame.querySelector('.tabs-arrow-left')).not.toBeNull()
    expect(frame.querySelector('.tabs-arrow-right')).toBeNull()
  })
})
