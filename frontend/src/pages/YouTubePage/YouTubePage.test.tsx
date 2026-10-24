import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { THEMES } from '../../layout/theme'
import { ApiError } from '../../services/api'
import { a11yViolations } from '../../test/a11y'
import { stubApi } from '../../test/api'
import { makeVideo, pageOfVideos, VIDEOS } from '../../test/fixtures/site'
import { ADMIN, forever, renderView, shootWhole, textOf } from '../../test/render'
import { YouTubePage } from './YouTubePage'

const grid = () => page.getByRole('list', { name: 'Videos' })
const tile = (title: string) => grid().getByRole('link', { name: `${title} (opens in a new tab)` })

describe('YouTube', () => {
  it('shows each video as a tile that opens it on YouTube in a new tab: thumbnail, title, date, description', async () => {
    stubApi()
    await renderView(<YouTubePage />, { path: '/youtube' })
    await expect.element(tile(VIDEOS[0].title)).toHaveAttribute('href', VIDEOS[0].url)
    await expect.element(tile(VIDEOS[0].title)).toHaveAttribute('target', '_blank')
    const card = tile(VIDEOS[0].title).element().closest('.media-card')!
    expect(card.querySelector('time')?.textContent).toBe('12 Oct 2026')
    expect(card.querySelector('time')?.getAttribute('datetime')).toBe(VIDEOS[0].publishedAt)
    expect(card.querySelector('.media-card-description')?.textContent).toBe(VIDEOS[0].description)
    expect(card.querySelector('.fitted-image-main')?.getAttribute('src')).toBe(VIDEOS[0].thumbnailUrl)
    expect(grid().element().querySelectorAll(':scope > li')).toHaveLength(3)
    expect(tile(VIDEOS[2].title).element().closest('.media-card')!.querySelector('.media-card-description')).toBeNull()
  })

  it('links to my YouTube page above the videos, in a new tab', async () => {
    stubApi()
    await renderView(<YouTubePage />, { path: '/youtube' })
    const visit = page.getByRole('link', { name: 'Visit my YouTube page' })
    await expect.element(visit).toHaveAttribute('href', 'https://www.youtube.com/@jechel')
    await expect.element(visit).toHaveAttribute('target', '_blank')
    await expect.element(tile(VIDEOS[0].title)).toBeVisible()
    // Before the grid.
    expect(visit.element().compareDocumentPosition(grid().element()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('has no link to my YouTube page without a channel, or when it cannot be loaded', async () => {
    const api = stubApi()
    api.youtube.channel.mockResolvedValue(null)
    const none = await renderView(<YouTubePage />, { path: '/youtube' })
    await expect.element(tile(VIDEOS[0].title)).toBeVisible()
    expect(page.getByRole('link', { name: 'Visit my YouTube page' }).query()).toBeNull()
    await none.unmount()

    api.youtube.channel.mockRejectedValue(new ApiError('/api/youtube/channel', 500))
    await renderView(<YouTubePage />, { path: '/youtube' })
    await expect.element(tile(VIDEOS[0].title)).toBeVisible()
    await expect.poll(() => api.youtube.channel.mock.calls.length).toBeGreaterThan(1)
    expect(page.getByRole('link', { name: 'Visit my YouTube page' }).query()).toBeNull()
  })

  it('asks for nine a page and pages through more, with the page in the URL', async () => {
    const api = stubApi()
    const all = Array.from({ length: 11 }, (_, i) => makeVideo(i + 1))
    api.youtube.listVideos.mockImplementation(async (pageNumber = 1, pageSize = 9) =>
      pageOfVideos(all.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), pageNumber, pageSize, all.length),
    )
    const view = await renderView(<YouTubePage />, { path: '/youtube' })
    await expect.element(page.getByText('Page 1 of 2')).toBeVisible()
    expect(api.youtube.listVideos).toHaveBeenCalledWith(1, 9, expect.anything())
    await page.getByRole('button', { name: 'Next' }).click()
    await expect.element(tile('Video 11')).toBeVisible()
    await expect.poll(() => view.location()).toBe('/youtube?page=2')
  })

  it('goes back to the first page with Previous, leaving the page out of the URL', async () => {
    const api = stubApi()
    const all = Array.from({ length: 11 }, (_, i) => makeVideo(i + 1))
    api.youtube.listVideos.mockImplementation(async (pageNumber = 1, pageSize = 9) =>
      pageOfVideos(all.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), pageNumber, pageSize, all.length),
    )
    const view = await renderView(<YouTubePage />, { path: '/youtube?page=2' })
    await expect.element(tile('Video 10')).toBeVisible()
    await page.getByRole('button', { name: 'Previous' }).click()
    await expect.element(tile('Video 1')).toBeVisible()
    await expect.poll(() => view.location()).toBe('/youtube')
  })

  for (const query of ['?page=0', '?page=-2', '?page=two']) {
    it(`reads ${query} in the URL as the first page`, async () => {
      const api = stubApi()
      await renderView(<YouTubePage />, { path: `/youtube${query}` })
      await expect.element(tile(VIDEOS[0].title)).toBeVisible()
      expect(api.youtube.listVideos).toHaveBeenCalledWith(1, 9, expect.anything())
    })
  }

  it('moves a page past the end (an old link) to the last page there is', async () => {
    const api = stubApi()
    const all = Array.from({ length: 11 }, (_, i) => makeVideo(i + 1))
    api.youtube.listVideos.mockImplementation(async (pageNumber = 1, pageSize = 9) =>
      pageOfVideos(all.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), pageNumber, pageSize, all.length),
    )
    const view = await renderView(<YouTubePage />, { path: '/youtube?page=7' })
    await expect.poll(() => view.location()).toBe('/youtube?page=2')
    await expect.element(tile('Video 11')).toBeVisible()
    await expect.element(page.getByText('Page 2 of 2')).toBeVisible()
  })

  it('shows no paging when every video fits on one page', async () => {
    stubApi()
    await renderView(<YouTubePage />)
    await expect.element(tile(VIDEOS[0].title)).toBeVisible()
    expect(page.getByRole('button', { name: 'Next' }).query()).toBeNull()
  })

  it('says so when there are no videos, and when they cannot be loaded (with a retry)', async () => {
    const api = stubApi()
    api.youtube.listVideos.mockResolvedValueOnce(pageOfVideos([]))
    const empty = await renderView(<YouTubePage />)
    await expect.element(page.getByText('No videos yet.')).toBeVisible()
    await empty.unmount()
    api.youtube.listVideos.mockRejectedValueOnce(new ApiError('/api/youtube', 503))
    await renderView(<YouTubePage />, { path: '/youtube?page=3' })
    await expect.poll(() => textOf(page.getByRole('alert'))).toContain("The videos can't be loaded right now.")
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect.element(grid()).toBeVisible()
  })

  it('shows placeholder tiles while loading', async () => {
    const api = stubApi()
    api.youtube.listVideos.mockReturnValue(forever())
    await renderView(<YouTubePage />)
    await expect.poll(() => textOf(page.getByRole('status'))).toBe('Loading videos…')
  })

  describe("the admin's Refresh from YouTube", () => {
    const refresh = () => page.getByRole('button', { name: 'Refresh from YouTube' })
    const phase = () => refresh().element().getAttribute('data-phase')
    const announced = () => document.querySelector('.refresh-status')?.textContent ?? ''
    const popup = () => page.getByRole('dialog', { name: "Couldn't refresh from YouTube" })
    const failure = (status: number, problem = {}) => new ApiError('/api/youtube/refresh', status, null, { method: 'POST', problem })

    it('is only there for the admin, an icon at the other end of the row from "Visit my YouTube page"', async () => {
      stubApi()
      const visitor = await renderView(<YouTubePage />)
      await expect.element(tile(VIDEOS[0].title)).toBeVisible()
      expect(refresh().query()).toBeNull()
      await visitor.unmount()
      stubApi({ user: ADMIN })
      await renderView(<YouTubePage />, { user: ADMIN })
      await expect.element(refresh()).toBeVisible()
      const row = document.querySelector('.youtube-channel')!
      expect([...row.children].map((c) => c.textContent || c.getAttribute('aria-label'))).toEqual(['Visit my YouTube page', 'Refresh from YouTube', null])
      expect(refresh().element().querySelector('.refresh-icon-refresh svg')).not.toBeNull()
      const link = page.getByRole('link', { name: 'Visit my YouTube page' }).element().getBoundingClientRect()
      const button = refresh().element().getBoundingClientRect()
      expect(button.top).toBeLessThan(link.bottom)
      expect(button.right).toBeCloseTo(row.getBoundingClientRect().right, 0)
    })

    it('spins while it asks, then a green tick, then the refresh icon again; the new video comes first', async () => {
      const api = stubApi({ user: ADMIN })
      await renderView(<YouTubePage />, { user: ADMIN })
      await expect.element(tile(VIDEOS[0].title)).toBeVisible()
      const uploaded = makeVideo(99, { title: 'Just uploaded' })
      let answer!: (count: number) => void
      api.youtube.listVideos.mockResolvedValue(pageOfVideos([uploaded, ...VIDEOS]))
      api.youtube.refreshVideos.mockReturnValue(new Promise((resolve) => (answer = resolve)))

      await refresh().click()
      await expect.poll(phase).toBe('busy')
      expect(announced()).toBe('Refreshing from YouTube…')
      // The tests ask for reduced motion: then it dims instead of spinning.
      expect(getComputedStyle(refresh().element().querySelector('.refresh-icon-refresh svg')!).opacity).toBe('0.5')
      // Pressed again meanwhile: nothing more is asked.
      await refresh().click()
      expect(api.youtube.refreshVideos).toHaveBeenCalledTimes(1)

      answer(4)
      await expect.poll(phase).toBe('done')
      expect(announced()).toBe('Up to date: 4 videos on YouTube.')
      await expect.poll(() => getComputedStyle(refresh().element().querySelector('.refresh-icon-done')!).opacity).toBe('1')
      await expect.element(tile('Just uploaded')).toBeVisible()
      expect(grid().element().querySelector('li')?.textContent).toContain('Just uploaded')
      expect(popup().query()).toBeNull()
      await expect.poll(phase, { timeout: 4000 }).toBe('idle')
    })

    it('says "1 video" for one', async () => {
      const api = stubApi({ user: ADMIN })
      api.youtube.refreshVideos.mockResolvedValue(1)
      await renderView(<YouTubePage />, { user: ADMIN })
      await refresh().click()
      await expect.poll(announced).toBe('Up to date: 1 video on YouTube.')
    })

    it('turns into a red cross and opens a popup with what went wrong, which only its × closes; the videos stay', async () => {
      const api = stubApi({ user: ADMIN })
      await renderView(<YouTubePage />, { user: ADMIN })
      await expect.element(tile(VIDEOS[0].title)).toBeVisible()
      api.youtube.refreshVideos.mockRejectedValue(
        failure(503, {
          detail: "YouTube can't be reached right now; the videos shown are the last ones saved.",
          cause: 'HttpRequestException: Response status code does not indicate success: 403 (Forbidden).',
        }),
      )
      await refresh().click()

      await expect.element(popup()).toBeVisible()
      expect(phase()).toBe('failed')
      expect(announced()).toBe("Couldn't refresh from YouTube.")
      await expect.element(popup().getByText("YouTube can't be reached right now; the videos shown are the last ones saved.", { exact: true })).toBeVisible()
      const details = popup().element().querySelector('pre')!.textContent!
      expect(details.split('\n')).toEqual([
        'Refresh from YouTube failed',
        expect.stringMatching(/^When: \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/),
        'Request: POST /api/youtube/refresh',
        'Status: 503',
        "API: YouTube can't be reached right now; the videos shown are the last ones saved.",
        'Cause: HttpRequestException: Response status code does not indicate success: 403 (Forbidden).',
      ])

      // Not Escape, not a click outside it.
      await userEvent.keyboard('{Escape}')
      document.querySelector<HTMLElement>('.modal-backdrop')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      document.querySelector<HTMLElement>('.modal-backdrop')!.click()
      await expect.element(popup()).toBeVisible()

      await popup().getByRole('button', { name: 'Close' }).click()
      expect(popup().query()).toBeNull()
      await expect.poll(phase).toBe('idle')
      await expect.element(tile(VIDEOS[0].title)).toBeVisible()
    })

    it('copies the details, with the copy button', async () => {
      const api = stubApi({ user: ADMIN })
      api.youtube.refreshVideos.mockRejectedValue(failure(500))
      await renderView(<YouTubePage />, { user: ADMIN })
      await refresh().click()
      await expect.element(popup()).toBeVisible()
      const written: string[] = []
      const spy = vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(async (text) => void written.push(text))
      try {
        await popup().getByRole('button', { name: 'Copy the error details' }).click()
        await expect.poll(() => written).toEqual([popup().element().querySelector('pre')!.textContent])
        expect(written[0]).toContain('Status: 500')
      } finally {
        spy.mockRestore()
      }
    })

    it.each([
      [0, "The API couldn't be reached. Check the connection, then try again.", 'Status: no answer'],
      [401, 'Your session has ended. Sign in again, then refresh.', 'Status: 401'],
      [503, "YouTube can't be reached right now, or isn't set up (Settings). The videos shown are the last ones saved.", 'Status: 503'],
      [500, "That didn't work. Please try again.", 'Status: 500'],
    ])('a failure with status %i says: %s', async (status, message, line) => {
      const api = stubApi({ user: ADMIN })
      api.youtube.refreshVideos.mockRejectedValue(failure(status))
      await renderView(<YouTubePage />, { user: ADMIN })
      await refresh().click()
      await expect.element(popup().getByText(message, { exact: true })).toBeVisible()
      expect(popup().element().querySelector('pre')!.textContent).toContain(line)
    })

    it('can be tried again once the popup is closed', async () => {
      const api = stubApi({ user: ADMIN })
      api.youtube.refreshVideos.mockRejectedValueOnce(failure(500)).mockResolvedValueOnce(3)
      await renderView(<YouTubePage />, { user: ADMIN })
      await refresh().click()
      await popup().getByRole('button', { name: 'Close' }).click()
      await refresh().click()
      await expect.poll(phase).toBe('done')
      expect(api.youtube.refreshVideos).toHaveBeenCalledTimes(2)
    })

    for (const theme of THEMES) {
      it(`${theme}: the row with the refresh, and the popup, with no WCAG problems`, async () => {
        const api = stubApi({ user: ADMIN })
        api.youtube.refreshVideos.mockRejectedValue(
          failure(503, { detail: "YouTube can't be reached right now; the videos shown are the last ones saved.", cause: 'HttpRequestException: 403 (Forbidden).' }),
        )
        await renderView(<YouTubePage />, { user: ADMIN, theme })
        await expect.element(tile(VIDEOS[0].title)).toBeVisible()
        expect(await a11yViolations()).toEqual([])
        await shootWhole(page.getByRole('main'), `${theme}-admin`)

        // The details say when: the same moment in every screenshot.
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-10-25T09:30:00Z'))
        try {
          await refresh().click()
          await expect.element(popup()).toBeVisible()
        } finally {
          vi.useRealTimers()
        }
        expect(await a11yViolations()).toEqual([])
        await expect(popup()).toMatchScreenshot(`${theme}-refresh-error`)
      })
    }
  })

  for (const theme of THEMES) {
    it(`${theme}: the grid, on a desktop and a phone, with no WCAG problems`, async () => {
      stubApi()
      const desktop = await renderView(<YouTubePage />, { theme })
      await expect.element(tile(VIDEOS[0].title)).toBeVisible()
      expect(await a11yViolations()).toEqual([])
      await shootWhole(page.getByRole('main'), `${theme}-grid`)
      await desktop.unmount()
      await page.viewport(390, 844)
      try {
        await renderView(<YouTubePage />, { theme })
        await expect.element(tile(VIDEOS[0].title)).toBeVisible()
        await shootWhole(page.getByRole('main'), `${theme}-phone`)
      } finally {
        await page.viewport(1280, 900)
      }
    })
  }
})
