import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { api, ApiError, type AppMedia } from '../../services/api'
import { stubApi } from '../../test/api'
import { ABOUT } from '../../test/fixtures/about'
import { renderApp, renderView } from '../../test/render'
import forest from '../../test/fixtures/tile-forest.svg?url'
import sunset from '../../test/fixtures/tile-sunset.svg?url'
import { MediaCarousel } from '../apps/MediaCarousel/MediaCarousel'
import { WorldMap } from '../about/places/WorldMap/WorldMap'
import { ContactForm } from '../contact/ContactForm/ContactForm'
import { useVisitorContactViewModel } from '../meetings/VisitorContact/VisitorContact.viewModel'
import { SubscribeDialog } from '../updates/SubscribeDialog/SubscribeDialog'
import { tracker } from './tracker'

// What the site itself tells the tracker (trackEvent): the outcome of what a visitor did, which the
// page's clicks alone don't say. Read from the site's one tracker, whatever it then does with them.

let reported: MockInstance<typeof tracker.event>
const names = () => reported.mock.calls.map(([name]) => name)
const lastReport = () => reported.mock.calls.at(-1)!

beforeEach(() => {
  reported = vi.spyOn(tracker, 'event')
})

describe('getting updates', () => {
  const subscribe = async (email = 'reader@example.com', open = true) => {
    if (open) await renderView(<SubscribeDialog onClose={() => {}} />)
    await page.getByRole('textbox', { name: 'Email' }).fill(email)
    await page.getByRole('dialog').getByRole('button', { name: /Subscribe/ }).click()
  }

  it('says whether the visitor subscribed, or already had', async () => {
    const stubs = stubApi()
    await subscribe()
    await expect.poll(names).toEqual(['Subscribed'])

    stubs.updates.subscribe.mockResolvedValue('pending')
    await subscribe()
    await expect.poll(() => names().at(-1)).toBe('Subscribed again (not confirmed yet)')

    stubs.updates.subscribe.mockResolvedValue('alreadySubscribed')
    await subscribe()
    await expect.poll(() => names().at(-1)).toBe('Subscribed again (already subscribed)')
  })

  it("says why subscribing didn't work, never the address", async () => {
    const stubs = stubApi()
    stubs.updates.subscribe.mockRejectedValueOnce(new ApiError('/api/updates/subscribe', 429))
    await subscribe('reader@example.com')
    await expect.poll(lastReport).toEqual(['Subscribing failed', { reason: 'too many tries' }])

    stubs.updates.subscribe.mockRejectedValueOnce(new ApiError('/api/updates/subscribe', 400, { email: ['Not an email.'] }))
    await subscribe('reader@example.org', false)
    await expect.poll(lastReport).toEqual(['Subscribing failed', { reason: 'invalid address' }])

    stubs.updates.subscribe.mockRejectedValueOnce(new ApiError('/api/updates/subscribe', 0))
    await subscribe('reader@example.net', false)
    await expect.poll(lastReport).toEqual(['Subscribing failed', { reason: 'no response' }])
    expect(JSON.stringify(reported.mock.calls)).not.toContain('@')
  })

  it("records confirming and unsubscribing from an email's link", async () => {
    stubApi()
    await renderApp({ path: '/updates/confirm?token=abc' })
    await expect.poll(names).toContain('Subscription confirmed')
    await renderApp({ path: '/updates/unsubscribe?token=abc' })
    await expect.poll(names).toContain('Unsubscribed')
  })

  it("doesn't report a link that didn't work as done", async () => {
    const stubs = stubApi()
    stubs.updates.confirm.mockRejectedValue(new ApiError('/api/updates/confirm', 404))
    await renderApp({ path: '/updates/confirm?token=old' })
    await expect.element(page.getByText(/isn't valid any more/)).toBeVisible()
    expect(names()).not.toContain('Subscription confirmed')
  })
})

describe('the contact form', () => {
  const fill = async () => {
    await page.getByRole('textbox', { name: 'Name' }).fill('Ada')
    await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.com')
    await page.getByRole('textbox', { name: 'Message' }).fill('Hello, I would like to talk about your apps and how you built the slider on the Apps page. Could we book a call next week, please?')
  }

  it('reports which fields stopped the visitor, then the message sent', async () => {
    vi.spyOn(api.contact, 'send').mockResolvedValue()
    await renderView(<ContactForm />)
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect.poll(lastReport).toEqual(['Contact form invalid', { fields: 'name, email, message' }])
    await fill()
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect.poll(() => names().at(-1)).toBe('Message sent')
  })

  it("says why a message wasn't sent, never what it said", async () => {
    const send = vi.spyOn(api.contact, 'send').mockRejectedValueOnce(new ApiError('/api/contact', 503))
    await renderView(<ContactForm />)
    await fill()
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect.poll(lastReport).toEqual(['Message not sent', { reason: '503' }])

    send.mockRejectedValueOnce(new ApiError('/api/contact', 400, { email: ['Not an email.'] }))
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect.poll(lastReport).toEqual(['Message not sent', { reason: 'invalid email' }])
    expect(JSON.stringify(reported.mock.calls)).not.toMatch(/Hello|ada@/)
  })
})

describe('booking a meeting', () => {
  function Booking() {
    const vm = useVisitorContactViewModel()
    return (
      <button type="button" onClick={vm.markBooked}>
        {vm.booked ? 'Booked' : 'Book'}
      </button>
    )
  }

  it('reports a meeting booked through the calendar', async () => {
    stubApi()
    await renderView(<Booking />)
    await page.getByRole('button', { name: 'Book' }).click()
    await expect.element(page.getByRole('button', { name: 'Booked' })).toBeVisible()
    expect(names()).toEqual(['Meeting booked'])
  })
})

describe("an app's images and videos", () => {
  const MEDIA: AppMedia[] = [
    { url: sunset, kind: 'image' },
    { url: forest, kind: 'image' },
    { url: sunset, kind: 'image' },
  ]

  it('reports swiping to another slide and moving with the arrow keys, not the arrow buttons (their clicks are recorded)', async () => {
    await renderView(<MediaCarousel media={MEDIA} title="Game" />)
    const track = document.querySelector<HTMLElement>('.carousel-track')!
    track.style.scrollSnapType = 'none'
    track.scrollLeft = track.clientWidth
    track.dispatchEvent(new Event('scroll'))
    await expect.poll(lastReport).toEqual(['Swiped to another slide', { app: 'Game', slide: '2 of 3' }])

    track.focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect.poll(lastReport).toEqual(['Moved to another slide with the keyboard', { app: 'Game', slide: '3 of 3' }])
    // Already at the end: nothing moved, nothing reported.
    const count = reported.mock.calls.length
    await userEvent.keyboard('{ArrowRight}')
    expect(reported.mock.calls).toHaveLength(count)

    await page.getByRole('button', { name: 'Previous' }).click()
    expect(reported.mock.calls).toHaveLength(count)
  })

  it('reports a slide passed on the way only when the swipe rests on it', async () => {
    await renderView(<MediaCarousel media={MEDIA} title="Game" />)
    const track = document.querySelector<HTMLElement>('.carousel-track')!
    track.style.scrollSnapType = 'none'
    track.scrollLeft = track.clientWidth * 0.5
    track.dispatchEvent(new Event('scroll'))
    expect(names()).toEqual([])
  })
})

describe('the map', () => {
  const renderMap = () => renderView(<WorldMap places={ABOUT.places} colors={ABOUT.colors.places} />)
  const svg = () => document.querySelector<SVGSVGElement>('.world-map-svg')!
  // The pointer may rest on a pin as the map appears: looking at a place isn't what these tests are about.
  const gestures = () => names().filter((name) => name !== 'Looked at a place on the map')

  it('reports looking at a place, once per place', async () => {
    await renderMap()
    const pin = page.getByRole('button', { name: /^Manchester/ })
    await pin.hover()
    await expect.poll(lastReport).toEqual(['Looked at a place on the map', { place: 'Manchester, England, United Kingdom' }])
    await page.getByRole('button', { name: /^Manchester/ }).hover()
    expect(names().filter((n) => n === 'Looked at a place on the map')).toHaveLength(1)
    ;(page.getByRole('button', { name: /^Bucharest/ }).element() as SVGElement).focus()
    await expect.poll(lastReport).toEqual(['Looked at a place on the map', { place: 'Bucharest, Bucureşti, Romania' }])
  })

  it('reports a scroll-zoom once the wheel stops, not every step', async () => {
    await renderMap()
    const map = svg()
    const box = map.getBoundingClientRect()
    for (let i = 0; i < 5; i++) map.dispatchEvent(new WheelEvent('wheel', { deltaY: -40, ctrlKey: true, clientX: box.left + 50, clientY: box.top + 50, bubbles: true, cancelable: true }))
    expect(gestures()).toEqual([])
    await expect.poll(gestures, { timeout: 2000 }).toEqual(['Zoomed the map'])
    expect(lastReport()[1]).toEqual({ how: 'scroll' })
  })

  it('reports moving the zoomed-in map by dragging, once it is let go', async () => {
    await renderMap()
    await page.getByRole('button', { name: 'Zoom in' }).click()
    const map = svg()
    // Made-up pointers can't be captured; a real one is.
    map.setPointerCapture = () => {}
    const box = map.getBoundingClientRect()
    const at = (x: number, type: string) => map.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: box.left + x, clientY: box.top + 60, bubbles: true, pointerType: 'mouse' }))
    at(100, 'pointerdown')
    at(140, 'pointermove')
    at(200, 'pointermove')
    expect(gestures()).toEqual([])
    at(200, 'pointerup')
    expect(gestures()).toEqual(['Moved the map'])
  })

  it('reports nothing for a plain click', async () => {
    await renderMap()
    const map = svg()
    const box = map.getBoundingClientRect()
    const at = (type: string) => map.dispatchEvent(new PointerEvent(type, { pointerId: 8, clientX: box.left + 100, clientY: box.top + 60, bubbles: true }))
    at('pointerdown')
    at('pointerup')
    expect(gestures()).toEqual([])
  })
})
