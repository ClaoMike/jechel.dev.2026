import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
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

  it('asks for nine a page and pages through more, with the page in the URL', async () => {
    const api = stubApi()
    const all = Array.from({ length: 11 }, (_, i) => makeVideo(i + 1))
    api.youtube.listVideos.mockImplementation(async (pageNumber = 1, pageSize = 9) => pageOfVideos(all.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), pageNumber, pageSize, all.length))
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
    api.youtube.listVideos.mockImplementation(async (pageNumber = 1, pageSize = 9) => pageOfVideos(all.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), pageNumber, pageSize, all.length))
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
    api.youtube.listVideos.mockImplementation(async (pageNumber = 1, pageSize = 9) => pageOfVideos(all.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), pageNumber, pageSize, all.length))
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

    it('is only there for the admin', async () => {
      stubApi()
      const visitor = await renderView(<YouTubePage />)
      await expect.element(tile(VIDEOS[0].title)).toBeVisible()
      expect(refresh().query()).toBeNull()
      await visitor.unmount()
      stubApi({ user: ADMIN })
      await renderView(<YouTubePage />, { user: ADMIN })
      await expect.element(refresh()).toBeVisible()
    })

    it('asks YouTube now, says how many videos there are, and shows the new one first', async () => {
      const api = stubApi({ user: ADMIN })
      await renderView(<YouTubePage />, { user: ADMIN })
      await expect.element(tile(VIDEOS[0].title)).toBeVisible()
      const uploaded = makeVideo(99, { title: 'Just uploaded' })
      api.youtube.listVideos.mockResolvedValue(pageOfVideos([uploaded, ...VIDEOS]))
      api.youtube.refreshVideos.mockResolvedValue(4)
      await refresh().click()
      await expect.poll(() => textOf(page.getByRole('status'))).toBe('✓ Up to date: 4 videos on YouTube.')
      await expect.element(tile('Just uploaded')).toBeVisible()
      expect(api.youtube.refreshVideos).toHaveBeenCalledTimes(1)
      expect(grid().element().querySelector('li')?.textContent).toContain('Just uploaded')
    })

    it('says "1 video" for one', async () => {
      const api = stubApi({ user: ADMIN })
      api.youtube.refreshVideos.mockResolvedValue(1)
      await renderView(<YouTubePage />, { user: ADMIN })
      await refresh().click()
      await expect.poll(() => textOf(page.getByRole('status'))).toBe('✓ Up to date: 1 video on YouTube.')
    })

    it('says "Refreshing…" and can\'t be pressed again meanwhile', async () => {
      const api = stubApi({ user: ADMIN })
      api.youtube.refreshVideos.mockReturnValue(forever())
      await renderView(<YouTubePage />, { user: ADMIN })
      await refresh().click()
      const busy = page.getByRole('button', { name: 'Refreshing…' })
      await expect.element(busy).toBeDisabled()
    })

    it('says when YouTube can\'t be reached, keeping the videos shown', async () => {
      const api = stubApi({ user: ADMIN })
      await renderView(<YouTubePage />, { user: ADMIN })
      await expect.element(tile(VIDEOS[0].title)).toBeVisible()
      api.youtube.refreshVideos.mockRejectedValue(new ApiError('/api/youtube/refresh', 503))
      await refresh().click()
      await expect.poll(() => textOf(page.getByRole('status'))).toBe("YouTube can't be reached right now, or isn't set up (Settings). The videos shown are the last ones saved.")
      await expect.element(tile(VIDEOS[0].title)).toBeVisible()
      await expect.element(refresh()).toBeEnabled()
    })

    it('says to try again on any other failure, and clears the message when trying again', async () => {
      const api = stubApi({ user: ADMIN })
      api.youtube.refreshVideos.mockRejectedValueOnce(new ApiError('/api/youtube/refresh', 500))
      await renderView(<YouTubePage />, { user: ADMIN })
      await refresh().click()
      await expect.poll(() => textOf(page.getByRole('status'))).toBe("That didn't work. Please try again.")
      api.youtube.refreshVideos.mockReturnValue(forever())
      await refresh().click()
      await expect.poll(() => page.getByRole('status').query()).toBeNull()
    })

    it('has no WCAG problems, with its message', async () => {
      stubApi({ user: ADMIN })
      await renderView(<YouTubePage />, { user: ADMIN })
      await refresh().click()
      await expect.element(page.getByRole('status')).toBeVisible()
      expect(await a11yViolations()).toEqual([])
    })
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
