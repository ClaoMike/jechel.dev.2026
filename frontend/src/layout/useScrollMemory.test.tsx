import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/render'

let y = 0
beforeEach(() => {
  y = 0
  sessionStorage.clear()
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => y)
  vi.spyOn(window, 'scrollTo').mockImplementation(((_x: number, top: number) => {
    y = top
  }) as typeof window.scrollTo)
})
afterEach(() => vi.restoreAllMocks())

const tab = (name: string) => within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('link', { name })

describe('each page keeps its own scroll position', () => {
  it('starts a new page at the top, and comes back to where a page was', async () => {
    renderApp('/apps')
    await screen.findByRole('heading', { name: 'Apps' })

    y = 600
    fireEvent.scroll(window)
    fireEvent.click(tab('About Me'))
    await screen.findByRole('region', { name: 'Skills' })
    expect(y).toBe(0)

    y = 250
    fireEvent.scroll(window)
    fireEvent.click(tab('Apps'))
    await screen.findByRole('heading', { name: 'Apps' })
    expect(y).toBe(600)

    fireEvent.click(tab('About Me'))
    await screen.findByRole('region', { name: 'Skills' })
    expect(y).toBe(250)
  })
})
