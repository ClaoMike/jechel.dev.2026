import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'

// jsdom has no matchMedia, which PageTransition reads as "no motion". Pretend motion is fine.
beforeEach(() => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia
})

const leaving = () => document.querySelector('.page-leave')
const entering = () => document.querySelector('.page-enter')

describe('PageTransition', () => {
  it('slides the pages left when going to a tab further right', async () => {
    renderApp('/apps')
    await screen.findByRole('heading', { name: 'Apps' })

    await userEvent.click(screen.getByRole('link', { name: 'Contact' }))

    expect(leaving()).toHaveClass('page-to-left')
    expect(leaving()).toHaveAttribute('inert')
    expect(leaving()).toHaveTextContent('Apps')
    expect(entering()).toHaveClass('page-to-left')
    expect(screen.getByRole('heading', { name: 'Contact me' })).toBeInTheDocument()

    // jsdom runs no CSS animations: the old page goes when the fallback timer fires.
    await waitFor(() => expect(leaving()).not.toBeInTheDocument(), { timeout: 1500 })
    expect(entering()).not.toBeInTheDocument()
  })

  it('slides the pages right when going to a tab further left', async () => {
    renderApp('/contact')
    await screen.findByRole('heading', { name: 'Contact me' })

    await userEvent.click(screen.getByRole('link', { name: 'Apps' }))

    expect(leaving()).toHaveClass('page-to-right')
    expect(entering()).toHaveClass('page-to-right')
  })

  it("doesn't slide for visitors who prefer less motion", async () => {
    window.matchMedia = ((query: string) => ({ matches: true, media: query })) as unknown as typeof window.matchMedia
    renderApp('/apps')
    await screen.findByRole('heading', { name: 'Apps' })

    await userEvent.click(screen.getByRole('link', { name: 'Contact' }))

    expect(leaving()).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Apps' })).not.toBeInTheDocument()
  })
})
