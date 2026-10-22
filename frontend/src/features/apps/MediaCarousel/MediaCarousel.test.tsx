import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import type { AppMedia } from '../../../services/api'
import { a11yViolations } from '../../../test/a11y'
import { renderView, textOf } from '../../../test/render'
import forest from '../../../test/fixtures/tile-forest.svg?url'
import sunset from '../../../test/fixtures/tile-sunset.svg?url'
import { MediaCarousel } from './MediaCarousel'
import { ARRIVAL_TIMEOUT_MS } from './MediaCarousel.viewModel'

const MEDIA: AppMedia[] = [
  { url: sunset, kind: 'image' },
  { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', kind: 'youtube' },
  { url: forest, kind: 'image' },
  { url: '/api/files/app-media/clip.mp4', kind: 'video' },
]

const carousel = () => page.getByRole('region', { name: 'Game: images and videos' })
const count = () => textOf(page.getByText(/^\d+ \/ \d+$/))

describe('the image and video slider', () => {
  it('shows one slide at a time, named "n of total", with the first image named after the app', async () => {
    await renderView(<MediaCarousel media={MEDIA} title="Game" />)
    await expect.element(carousel()).toHaveAttribute('aria-roledescription', 'carousel')
    const slides = carousel().getByRole('group').elements().filter((g) => g.getAttribute('aria-roledescription') === 'slide')
    expect(slides.map((s) => s.getAttribute('aria-label'))).toEqual(['1 of 4', '2 of 4', '3 of 4', '4 of 4'])
    await expect.element(page.getByRole('img', { name: 'Game, image 1 of 4' })).toBeVisible()
    expect(document.querySelector('video')?.getAttribute('aria-label')).toBe('Game, video 4 of 4')
    await expect.poll(count).toBe('1 / 4')
  })

  it('moves with the arrows, the dots and the arrow keys, never past either end', async () => {
    await renderView(<MediaCarousel media={MEDIA} title="Game" />)
    const previous = page.getByRole('button', { name: 'Previous' })
    const next = page.getByRole('button', { name: 'Next' })
    await expect.element(previous).toBeDisabled()
    await next.click()
    await expect.poll(count).toBe('2 / 4')
    await expect.element(page.getByRole('button', { name: 'Show 2 of 4' })).toHaveAttribute('aria-current', 'true')
    await page.getByRole('button', { name: 'Show 4 of 4' }).click()
    await expect.poll(count).toBe('4 / 4')
    await expect.element(next).toBeDisabled()
    ;(document.querySelector('.carousel-track') as HTMLElement).focus()
    await userEvent.keyboard('{ArrowLeft}')
    await expect.poll(count).toBe('3 / 4')
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    await expect.poll(count).toBe('4 / 4')
  })

  it("loads YouTube's player only on its own slide: elsewhere it's a thumbnail that goes there", async () => {
    await renderView(<MediaCarousel media={MEDIA} title="Game" />)
    expect(document.querySelector('iframe')).toBeNull()
    const thumbnail = page.getByRole('button', { name: 'Show Game, video 2 of 4' })
    expect(thumbnail.element().querySelector('img')?.getAttribute('src')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
    // It sits on a slide out of sight (the track scrolls sideways): what clicking it does.
    ;(thumbnail.element() as HTMLElement).click()
    await expect.poll(() => document.querySelector('iframe')?.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect.poll(() => document.querySelector('iframe')).toBeNull()
  })

  it('pauses a video when moving away from it', async () => {
    await renderView(<MediaCarousel media={MEDIA} title="Game" />)
    const video = document.querySelector('video')!
    let paused = 0
    Object.defineProperty(video, 'paused', { configurable: true, get: () => false })
    video.pause = () => void paused++
    await page.getByRole('button', { name: 'Show 4 of 4' }).click()
    await page.getByRole('button', { name: 'Show 1 of 4' }).click()
    expect(paused).toBeGreaterThan(0)
  })

  it('has no controls for a single item, and nothing at all without media; a bad YouTube link is left out', async () => {
    const one = await renderView(<MediaCarousel media={[MEDIA[0]]} title="Game" />)
    await expect.element(carousel()).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    await one.unmount()
    const none = await renderView(<MediaCarousel media={[]} title="Game" />)
    expect(none.container.querySelector('.carousel')).toBeNull()
    await none.unmount()
    await renderView(<MediaCarousel media={[{ url: 'https://youtube.com/watch?v=bad', kind: 'youtube' }, MEDIA[0]]} title="Game" />)
    expect(document.querySelector('.carousel-slide')?.childElementCount).toBe(0)
  })

  it('has no WCAG problems', async () => {
    await renderView(<MediaCarousel media={MEDIA} title="Game" />, { theme: 'light' })
    expect(await a11yViolations()).toEqual([])
  })

  it('goes back with Previous, and ignores keys other than the arrows', async () => {
    await renderView(<MediaCarousel media={MEDIA} title="Game" />)
    await page.getByRole('button', { name: 'Show 3 of 4' }).click()
    await expect.poll(count).toBe('3 / 4')

    await page.getByRole('button', { name: 'Previous' }).click()
    await expect.poll(count).toBe('2 / 4')

    ;(document.querySelector('.carousel-track') as HTMLElement).focus()
    await userEvent.keyboard('{ArrowUp}{Enter}a')
    expect(count()).toBe('2 / 4')
  })

  describe('while an arrow\'s smooth scroll is on its way', () => {
    /** The track, its scrolls taken over by the test: each position is set by hand, as a smooth scroll's frames would. */
    async function slider() {
      const real = window.matchMedia.bind(window)
      vi.spyOn(window, 'matchMedia').mockImplementation((q) => (q.includes('reduced-motion') ? ({ ...real(q), matches: false } as MediaQueryList) : real(q)))
      const scrollTo = vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(() => {})
      await renderView(<MediaCarousel media={MEDIA} title="Game" />)
      const track = document.querySelector<HTMLElement>('.carousel-track')!
      track.style.scrollSnapType = 'none'
      const at = (slides: number) => {
        track.scrollLeft = slides * track.clientWidth
        track.dispatchEvent(new Event('scroll'))
      }
      return { scrollTo, at }
    }

    it("shows the new count at once, and doesn't flick back while the slide is still leaving", async () => {
      const { scrollTo, at } = await slider()

      await page.getByRole('button', { name: 'Next' }).click()
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
      await expect.poll(count).toBe('2 / 4')

      // The first frames: still resting (to the pixel) on the slide it leaves.
      at(0)
      at(0.004)
      await new Promise((r) => setTimeout(r, 50))
      expect(count()).toBe('2 / 4')
      at(0.5)
      at(1)
      expect(count()).toBe('2 / 4')
    })

    it('counts the track again once the scroll has arrived (a swipe after it)', async () => {
      const { at } = await slider()
      await page.getByRole('button', { name: 'Next' }).click()
      at(1)

      at(2)

      await expect.poll(count).toBe('3 / 4')
    })

    it("counts where the track is if the scroll never arrives (a swipe took over)", async () => {
      const { at } = await slider()
      await page.getByRole('button', { name: 'Show 4 of 4' }).click()
      await expect.poll(count).toBe('4 / 4')

      // Swiped back to the second slide before getting there.
      at(1)
      expect(count()).toBe('4 / 4')

      await expect.poll(count, { timeout: ARRIVAL_TIMEOUT_MS + 1000 }).toBe('2 / 4')
    })
  })
})
