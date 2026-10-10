import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'
import { API, makeVideos, server, youtube } from '../test/server'
import { formatDate } from '../utils/formatDate'

async function renderVideos(count: number, url = '/youtube') {
  const videos = makeVideos(count)
  server.use(youtube(videos))
  renderApp(url)
  await waitFor(() => expect(screen.queryByText('Loading videos…')).not.toBeInTheDocument())
  return { user: userEvent.setup(), videos }
}

const cards = () => within(screen.getByRole('list', { name: 'Videos' })).getAllByRole('link')

describe('YouTubePage', () => {
  it('shows nine videos in a grid: thumbnail, title, date and description, each opening YouTube in a new tab', async () => {
    const { videos } = await renderVideos(12)

    expect(screen.getByRole('heading', { name: 'YouTube' })).toBeInTheDocument()
    expect(cards()).toHaveLength(9)
    const first = screen.getByRole('link', { name: 'Video 1 (opens in a new tab)' })
    expect(first).toHaveAttribute('href', 'https://www.youtube.com/watch?v=v1')
    expect(first).toHaveAttribute('target', '_blank')
    expect(first).toHaveAttribute('rel', 'noopener noreferrer')
    expect(first).toHaveAccessibleDescription(videos[0].description.trim())
    expect(first.querySelector('img')).toHaveAttribute('src', videos[0].thumbnailUrl)
    expect(within(first).getByText(formatDate(videos[0].publishedAt))).toHaveAttribute('dateTime', videos[0].publishedAt)
  })

  it('pages through the videos, keeping the page in the URL', async () => {
    const { user } = await renderVideos(12)

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByRole('link', { name: 'Video 10 (opens in a new tab)' })).toBeInTheDocument()
    expect(cards()).toHaveLength(3)
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByRole('link', { name: 'Video 1 (opens in a new tab)' })).toBeInTheDocument()
  })

  it('opens on the page in the URL', async () => {
    await renderVideos(12, '/youtube?page=2')
    expect(screen.getByRole('link', { name: 'Video 10 (opens in a new tab)' })).toBeInTheDocument()
  })

  it('falls back to the last page for a page past the end', async () => {
    await renderVideos(12, '/youtube?page=7')
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
  })

  it('has no pagination when everything fits on one page', async () => {
    await renderVideos(5)

    expect(cards()).toHaveLength(5)
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
  })

  it('says when there are no videos', async () => {
    await renderVideos(0)
    expect(screen.getByText('No videos yet.')).toBeInTheDocument()
  })

  it('says when the videos cannot be loaded', async () => {
    server.use(http.get(`${API}/api/youtube/videos`, () => HttpResponse.json({ title: "YouTube isn't set up" }, { status: 503 })))
    renderApp('/youtube')

    expect(await screen.findByRole('alert')).toHaveTextContent("The videos can't be loaded right now.")
  })
})
