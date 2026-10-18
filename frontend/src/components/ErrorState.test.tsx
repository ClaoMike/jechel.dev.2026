import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'
import { API, server } from '../test/server'

describe('when loading fails', () => {
  it('a grid says so, and Try again loads it again', async () => {
    let calls = 0
    server.use(
      http.get(`${API}/api/youtube/videos`, () => {
        calls++
        return calls === 1 ? new HttpResponse(null, { status: 503 }) : HttpResponse.json({ items: [{ id: 'v1', title: 'Devlog 1', description: '', thumbnailUrl: '', publishedAt: '2026-10-01T00:00:00Z' }], page: 1, pageSize: 9, totalCount: 1 })
      }),
    )
    const user = userEvent.setup()
    renderApp('/youtube')

    expect(await screen.findByRole('alert')).toHaveTextContent("The videos can't be loaded right now.")
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Devlog 1')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it("What's new says so when nothing could be loaded, instead of 'nothing here yet'", async () => {
    server.use(
      http.get(`${API}/api/apps`, () => new HttpResponse(null, { status: 500 })),
      http.get(`${API}/api/youtube/videos`, () => new HttpResponse(null, { status: 503 })),
    )
    renderApp('/')

    expect(await screen.findByRole('alert')).toHaveTextContent("The newest app and video can't be loaded right now.")
    expect(screen.queryByText(/Nothing here yet/)).not.toBeInTheDocument()
  })

  it('while loading, placeholders stand in, and screen readers hear what is loading', async () => {
    server.use(http.get(`${API}/api/apps`, () => new Promise(() => {})))
    renderApp('/apps')

    // (First the page's own placeholder, while it's known whether visitors may see Apps.)
    const status = (await screen.findByText('Loading apps…')).closest<HTMLElement>('[role="status"]')!
    expect(status).toHaveTextContent('Loading apps…')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status.querySelectorAll('.skeleton').length).toBeGreaterThan(5)
  })
})
