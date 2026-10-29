import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { AppsPage } from '@/pages/apps'
import { YouTubePage } from '@/pages/youtube'
import { ApiError, type YouTubeVideo } from '@/shared/api'
import { stubApi, type ApiStubs } from '@/test/api'
import { makeApp, pageOf } from '@/test/fixtures/apps'
import { makeVideo, pageOfVideos } from '@/test/fixtures/site'
import { ADMIN, forever, renderView, textOf } from '@/test/render'
import { RESIZE, SLIDE_FALLBACK_MS } from '@/shared/ui/PagedGrid/slide'

// The paged grid (Apps and YouTube): loading the pages next to the one on show ahead, and sliding
// between pages. Tested through the YouTube page (and Apps for its admin's 8 a page), the API stubbed.

const VIDEOS = Array.from({ length: 25 }, (_, i) => makeVideo(i + 1))

/** A channel with `count` videos (25: three pages of 9), answered by page like the API. */
function channel(api: ApiStubs, count = 25) {
  const all = VIDEOS.slice(0, count)
  api.youtube.listVideos.mockImplementation(async (pageNumber = 1, pageSize = 9) =>
    pageOfVideos(all.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), pageNumber, pageSize, all.length),
  )
}

/** The pages asked for, in order (page, size). */
const asked = (api: ApiStubs) => api.youtube.listVideos.mock.calls.map(([p, size]) => `${p}/${size}`)

const grid = () => page.getByRole('list', { name: 'Videos' })
const tile = (title: string) => grid().getByRole('link', { name: `${title} (opens in a new tab)` })
const leaving = () => document.querySelector<HTMLElement>('.grid-leave')
const entering = () => grid().element()

/** Lets the system allow motion (tests run with reduced motion, like some visitors). */
function allowMotion() {
  const real = window.matchMedia.bind(window)
  vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
    query.includes('prefers-reduced-motion') ? ({ ...real(query), matches: false, media: query } as MediaQueryList) : real(query),
  )
}

/** A promise settled by the test. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('loading the pages next to the one on show', () => {
  afterEach(() => vi.useRealTimers())

  it('loads the next page ahead on the first page', async () => {
    const api = stubApi()
    channel(api)
    await renderView(<YouTubePage />, { path: '/youtube' })
    await expect.poll(() => asked(api)).toEqual(['1/9', '2/9'])
  })

  it('loads both neighbours on a middle page, and only the previous one on the last', async () => {
    const api = stubApi()
    channel(api)
    const middle = await renderView(<YouTubePage />, { path: '/youtube?page=2' })
    await expect.poll(() => asked(api).sort()).toEqual(['1/9', '2/9', '3/9'])
    await middle.unmount()

    api.youtube.listVideos.mockClear()
    await renderView(<YouTubePage />, { path: '/youtube?page=3' })
    await expect.element(tile('Video 25')).toBeVisible()
    await expect.poll(() => asked(api)).toEqual(['3/9', '2/9'])
  })

  it('loads nothing ahead when everything fits on one page', async () => {
    const api = stubApi()
    channel(api, 5)
    await renderView(<YouTubePage />)
    await expect.element(tile('Video 1')).toBeVisible()
    await new Promise((r) => setTimeout(r, 100))
    expect(asked(api)).toEqual(['1/9'])
  })

  it('shows a page loaded ahead at once, without asking again, then loads the one after it', async () => {
    const api = stubApi()
    channel(api)
    await renderView(<YouTubePage />)
    await expect.poll(() => asked(api)).toEqual(['1/9', '2/9'])

    await page.getByRole('button', { name: 'Next' }).click()

    await expect.element(tile('Video 10')).toBeVisible()
    expect(page.getByRole('status').query()).toBeNull()
    await expect.poll(() => asked(api)).toEqual(['1/9', '2/9', '3/9'])
  })

  it("doesn't ask again for a page it has fresh, going back and forth", async () => {
    const api = stubApi()
    channel(api)
    await renderView(<YouTubePage />)
    await expect.poll(() => asked(api)).toEqual(['1/9', '2/9'])
    await page.getByRole('button', { name: 'Next' }).click()
    await expect.poll(() => asked(api)).toEqual(['1/9', '2/9', '3/9'])

    await page.getByRole('button', { name: 'Previous' }).click()
    await expect.element(tile('Video 1')).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect.element(tile('Video 10')).toBeVisible()
    await new Promise((r) => setTimeout(r, 100))

    expect(asked(api)).toEqual(['1/9', '2/9', '3/9'])
  })

  it('loads a neighbour ahead again once what it has is older than 30 seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const api = stubApi()
    channel(api)
    await renderView(<YouTubePage />)
    await expect.poll(() => asked(api)).toEqual(['1/9', '2/9'])
    await page.getByRole('button', { name: 'Next' }).click()
    await expect.poll(() => asked(api)).toEqual(['1/9', '2/9', '3/9'])

    vi.setSystemTime(Date.now() + 31_000)
    await page.getByRole('button', { name: 'Next' }).click()

    // Page 3 was older than 30 seconds: asked for again on the way there; page 2 (its neighbour) too.
    await expect.poll(() => asked(api).slice(3).sort()).toEqual(['2/9', '3/9'])
  })

  it('asks for the page again when loading it ahead failed', async () => {
    const api = stubApi()
    channel(api)
    const real = api.youtube.listVideos.getMockImplementation()!
    api.youtube.listVideos.mockImplementation(async (pageNumber = 1, pageSize = 9, signal) =>
      pageNumber === 2 && asked(api).filter((a) => a === '2/9').length === 1 ? Promise.reject(new ApiError('/api/youtube/videos', 503)) : real(pageNumber, pageSize, signal),
    )
    await renderView(<YouTubePage />)
    await expect.poll(() => asked(api)).toEqual(['1/9', '2/9'])
    // The page on show is unaffected.
    expect(page.getByRole('alert').query()).toBeNull()

    await page.getByRole('button', { name: 'Next' }).click()

    await expect.element(tile('Video 10')).toBeVisible()
    expect(asked(api).filter((a) => a === '2/9')).toHaveLength(2)
  })

  it("loads ahead at the admin's page size on Apps (8, with the Add tile)", async () => {
    const api = stubApi({ user: ADMIN })
    const apps = Array.from({ length: 20 }, (_, i) => makeApp(i + 1))
    api.apps.list.mockImplementation(async (pageNumber = 1, pageSize = 9) =>
      pageOf(apps.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), { page: pageNumber, pageSize, totalCount: apps.length }),
    )
    await renderView(<AppsPage />, { user: ADMIN })
    await expect.poll(() => api.apps.list.mock.calls.map(([p, size]) => `${p}/${size}`)).toEqual(['1/8', '2/8'])
  })
})

describe('sliding between pages', () => {
  it('slides the old page out to the left and the next one in from the right', async () => {
    allowMotion()
    const api = stubApi()
    channel(api)
    await renderView(<YouTubePage />)
    await expect.poll(() => asked(api)).toContain('2/9')

    await page.getByRole('button', { name: 'Next' }).click()

    await expect.element(tile('Video 10')).toBeVisible()
    expect(entering().className).toBe('paged-grid-items grid-enter grid-to-left')
    const old = leaving()!
    expect(old.className).toBe('paged-grid-items grid-leave grid-to-left')
    expect(old.textContent).toContain('Video 1')
    expect(old.textContent).not.toContain('Video 10')
    // Out of the way while it goes: not focusable, not read out, a single "Videos" list.
    expect(old.inert).toBe(true)
    expect(old.getAttribute('aria-hidden')).toBe('true')
    expect(page.getByRole('list', { name: 'Videos' }).all()).toHaveLength(1)
  })

  it('slides the other way going back', async () => {
    allowMotion()
    const api = stubApi()
    channel(api)
    await renderView(<YouTubePage />, { path: '/youtube?page=2' })
    await expect.poll(() => asked(api)).toContain('1/9')

    await page.getByRole('button', { name: 'Previous' }).click()

    await expect.element(tile('Video 1')).toBeVisible()
    expect(entering().className).toBe('paged-grid-items grid-enter grid-to-right')
    expect(leaving()!.className).toBe('paged-grid-items grid-leave grid-to-right')
    expect(leaving()!.textContent).toContain('Video 10')
  })

  it('takes the old page away when its animation ends, not when a tile in it finishes one', async () => {
    allowMotion()
    const api = stubApi()
    channel(api)
    await renderView(<YouTubePage />)
    await expect.poll(() => asked(api)).toContain('2/9')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect.element(tile('Video 10')).toBeVisible()

    leaving()!
      .querySelector('li')!
      .dispatchEvent(new AnimationEvent('animationend', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 50))
    expect(leaving()).not.toBeNull()

    leaving()!.dispatchEvent(new AnimationEvent('animationend', { bubbles: true }))
    await expect.poll(() => leaving()).toBeNull()
    expect(entering().textContent).toContain('Video 10')
  })

  it('takes the old page away anyway if its animation never ends', async () => {
    allowMotion()
    const api = stubApi()
    channel(api)
    await renderView(<YouTubePage />)
    await expect.poll(() => asked(api)).toContain('2/9')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect.element(tile('Video 10')).toBeVisible()
    expect(leaving()).not.toBeNull()

    // Animations are switched off in tests: only the fallback can take it away.
    await expect.poll(() => leaving(), { timeout: SLIDE_FALLBACK_MS + 1000 }).toBeNull()
  })

  it("doesn't move for visitors who asked for reduced motion", async () => {
    const api = stubApi()
    channel(api)
    await renderView(<YouTubePage />)
    await expect.poll(() => asked(api)).toContain('2/9')

    await page.getByRole('button', { name: 'Next' }).click()

    await expect.element(tile('Video 10')).toBeVisible()
    expect(leaving()).toBeNull()
    expect(entering().className).toBe('paged-grid-items')
  })

  it("slides a page that wasn't loaded ahead in from its side once it arrives, with nothing to slide out", async () => {
    allowMotion()
    const api = stubApi()
    channel(api)
    const page2 = deferred<ReturnType<typeof pageOfVideos>>()
    const real = api.youtube.listVideos.getMockImplementation()!
    api.youtube.listVideos.mockImplementation((pageNumber = 1, pageSize = 9, signal) => (pageNumber === 2 ? page2.promise : real(pageNumber, pageSize, signal)))
    await renderView(<YouTubePage />)
    await expect.element(tile('Video 1')).toBeVisible()

    await page.getByRole('button', { name: 'Next' }).click()
    await expect.poll(() => textOf(page.getByRole('status'))).toBe('Loading videos…')
    page2.resolve(pageOfVideos(VIDEOS.slice(9, 18), 2, 9, VIDEOS.length))

    await expect.element(tile('Video 10')).toBeVisible()
    expect(entering().className).toBe('paged-grid-items grid-enter grid-to-left')
    expect(leaving()).toBeNull()
  })

  it("doesn't move when the page on show is loaded again (the admin's refresh)", async () => {
    allowMotion()
    const api = stubApi({ user: ADMIN })
    channel(api)
    await renderView(<YouTubePage />, { user: ADMIN })
    await expect.element(tile('Video 1')).toBeVisible()
    const uploaded: YouTubeVideo = makeVideo(99, { title: 'Just uploaded' })
    const real = api.youtube.listVideos.getMockImplementation()!
    api.youtube.listVideos.mockImplementation(async (pageNumber = 1, pageSize = 9, signal) => {
      const answer = await real(pageNumber, pageSize, signal)
      return pageNumber === 1 ? { ...answer, items: [uploaded, ...answer.items.slice(0, 8)] } : answer
    })

    await page.getByRole('button', { name: 'Refresh from YouTube' }).click()

    await expect.element(tile('Just uploaded')).toBeVisible()
    expect(leaving()).toBeNull()
    expect(entering().className).toBe('paged-grid-items')
  })

  it("doesn't move when first shown, or for a stale page moved to the last one", async () => {
    allowMotion()
    const api = stubApi()
    channel(api)
    const view = await renderView(<YouTubePage />, { path: '/youtube?page=9' })
    await expect.poll(() => view.location()).toBe('/youtube?page=3')
    await expect.element(tile('Video 25')).toBeVisible()
    expect(leaving()).toBeNull()
    expect(entering().className).toBe('paged-grid-items')
  })

  it("takes the admin's Add tile out with the first page on Apps, and leaves it off the next", async () => {
    allowMotion()
    const api = stubApi({ user: ADMIN })
    const apps = Array.from({ length: 20 }, (_, i) => makeApp(i + 1))
    api.apps.list.mockImplementation(async (pageNumber = 1, pageSize = 9) =>
      pageOf(apps.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), { page: pageNumber, pageSize, totalCount: apps.length }),
    )
    await renderView(<AppsPage />, { user: ADMIN })
    await expect.poll(() => api.apps.list.mock.calls.length).toBe(2)

    await page.getByRole('button', { name: 'Next' }).click()

    const appsGrid = page.getByRole('list', { name: 'Apps' })
    await expect.element(appsGrid.getByText('App 9')).toBeVisible()
    expect(leaving()!.textContent).toContain('Add an app')
    expect(appsGrid.element().textContent).not.toContain('Add an app')
  })

  it('keeps the placeholders steady while a page loads', async () => {
    allowMotion()
    const api = stubApi()
    api.youtube.listVideos.mockReturnValue(forever())
    await renderView(<YouTubePage />)
    await expect.poll(() => textOf(page.getByRole('status'))).toBe('Loading videos…')
    expect(leaving()).toBeNull()
  })
})

describe("the grid's height following a slide (Previous / Next glide instead of jumping)", () => {
  const stage = () => document.querySelector<HTMLElement>('.paged-grid-stage')!
  const pagination = () => page.getByRole('navigation', { name: 'Pagination' }).element()
  /** How far below the grid's top Previous / Next is (scrolling doesn't change it). */
  const paginationDrop = () => pagination().getBoundingClientRect().top - stage().getBoundingClientRect().top
  const resize = () => stage().getAnimations()[0]
  const heights = (animation: Animation) => (animation.effect as KeyframeEffect).getKeyframes().map((frame) => frame.height)

  /** 20 videos: two full pages of 9 (three rows), then 2 (one row). */
  async function openPage(path: string) {
    allowMotion()
    const api = stubApi()
    channel(api, 20)
    await renderView(<YouTubePage />, { path })
    await expect.poll(() => api.youtube.listVideos.mock.calls.length).toBeGreaterThanOrEqual(2)
    return api
  }

  it("glides Previous / Next up to a shorter page, at the slide's pace", async () => {
    await openPage('/youtube?page=2')
    await expect.element(tile('Video 10')).toBeVisible()
    const tall = stage().offsetHeight
    const before = paginationDrop()

    await page.getByRole('button', { name: 'Next' }).click()
    await expect.element(tile('Video 19')).toBeVisible()

    const animation = resize()
    animation.pause()
    const short = (grid().element() as HTMLElement).offsetHeight
    expect(short).toBeLessThan(tall)
    expect(heights(animation)).toEqual([`${tall}px`, `${short}px`])
    expect((animation.effect as KeyframeEffect).getTiming()).toMatchObject({ duration: RESIZE.duration, easing: RESIZE.easing })
    expect(stage().classList).toContain('grid-resizing')

    // It starts where it was, moves up gradually, and ends under the shorter page.
    animation.currentTime = 0
    expect(paginationDrop()).toBeCloseTo(before, 0)
    animation.currentTime = RESIZE.duration / 2
    const halfway = paginationDrop()
    expect(halfway).toBeLessThan(before)
    animation.finish()
    expect(paginationDrop()).toBeLessThan(halfway)
    expect(paginationDrop()).toBeCloseTo(before - (tall - short), 0)
    await expect.poll(() => stage().classList.contains('grid-resizing')).toBe(false)
  })

  it('glides them down to a taller page going back', async () => {
    await openPage('/youtube?page=3')
    await expect.element(tile('Video 19')).toBeVisible()
    const short = stage().offsetHeight

    await page.getByRole('button', { name: 'Previous' }).click()
    await expect.element(tile('Video 10')).toBeVisible()

    const animation = resize()
    animation.finish()
    const [from, to] = heights(animation)
    expect(from).toBe(`${short}px`)
    expect(Number.parseFloat(to as string)).toBeGreaterThan(short)
  })

  it("doesn't animate the height between pages of the same height", async () => {
    await openPage('/youtube')
    await expect.element(tile('Video 1')).toBeVisible()

    await page.getByRole('button', { name: 'Next' }).click()
    await expect.element(tile('Video 10')).toBeVisible()

    expect(leaving()).not.toBeNull()
    expect(stage().getAnimations()).toHaveLength(0)
    expect(stage().classList).not.toContain('grid-resizing')
  })

  it("doesn't animate the height for reduced motion: the page just changes", async () => {
    const api = stubApi()
    channel(api, 20)
    await renderView(<YouTubePage />, { path: '/youtube?page=2' })
    await expect.element(tile('Video 10')).toBeVisible()

    await page.getByRole('button', { name: 'Next' }).click()
    await expect.element(tile('Video 19')).toBeVisible()

    expect(stage().getAnimations()).toHaveLength(0)
  })

  it('stops cutting off the old page if the animation is cut short', async () => {
    await openPage('/youtube?page=2')
    await expect.element(tile('Video 10')).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect.element(tile('Video 19')).toBeVisible()

    resize().cancel()

    await expect.poll(() => stage().classList.contains('grid-resizing')).toBe(false)
  })
})
