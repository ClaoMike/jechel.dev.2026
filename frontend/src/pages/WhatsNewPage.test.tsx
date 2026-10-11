import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'
import { API, appsApi, makeApps, makeVideos, server, youtube } from '../test/server'
import { formatDate } from '../utils/formatDate'

/** App 1 was added on 1 Oct 2026; video 1 is published on the date given. */
function renderWith({ apps = 1, videos = 1, videoDate = '2026-10-05T12:00:00Z' } = {}) {
  const list = makeVideos(videos).map((v, i) => (i === 0 ? { ...v, publishedAt: videoDate, description: 'Full description.\n\nCode: https://github.com/x/y.' } : v))
  server.use(...appsApi(makeApps(apps)).handlers, youtube(list))
  renderApp('/')
  return userEvent.setup()
}

const item = () => screen.getByRole('article')

describe("What's new", () => {
  it('shows the newest video in full when it came after the newest app', async () => {
    renderWith()

    expect(await screen.findByRole('heading', { level: 3, name: 'Video 1' })).toBeInTheDocument()
    expect(within(item()).getByText(/^New video/)).toHaveTextContent(`New video · ${formatDate('2026-10-05T12:00:00Z')}`)
    expect(within(item()).getByTitle('Video 1')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/v1')
    expect(within(item()).getByText(/Full description\./)).toBeInTheDocument()
    expect(within(item()).getByRole('link', { name: 'https://github.com/x/y' })).toHaveAttribute('href', 'https://github.com/x/y')
    expect(within(item()).getByRole('link', { name: 'Watch on YouTube' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=v1')
  })

  it('shows the newest app in full when it came last: slider, labels, platforms and store links', async () => {
    const user = renderWith({ videoDate: '2026-09-01T12:00:00Z' })

    expect(await screen.findByRole('heading', { level: 3, name: 'App 1' })).toBeInTheDocument()
    expect(within(item()).getByText(/^New app/)).toBeInTheDocument()
    expect(within(item()).getByText('Video game')).toBeInTheDocument()
    expect(within(item()).getByRole('list', { name: 'Runs on' })).toHaveTextContent('iOSAndroid')
    expect(within(item()).getByRole('link', { name: 'Check it on App Store' })).toBeInTheDocument()
    const slider = within(item()).getByRole('region', { name: 'App 1: images and videos' })
    await user.click(within(slider).getByRole('button', { name: 'Next' }))
    expect(within(slider).getByText('2 / 3')).toBeInTheDocument()
    expect(within(item()).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('shows the newest app when YouTube cannot be loaded', async () => {
    server.use(...appsApi(makeApps(1)).handlers, http.get(`${API}/api/youtube/videos`, () => new HttpResponse(null, { status: 503 })))
    renderApp('/')

    expect(await screen.findByRole('heading', { level: 3, name: 'App 1' })).toBeInTheDocument()
  })

  it('says so when there is nothing yet', async () => {
    renderWith({ apps: 0, videos: 0 })

    expect(await screen.findByText('Nothing here yet. New apps and videos will show up here.')).toBeInTheDocument()
  })
})
