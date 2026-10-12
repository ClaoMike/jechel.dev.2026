import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type VisitBatch } from '../../services/api'
import { API, server } from '../../test/server'
import { createTracker, FLUSH_DELAY_MS } from './tracker'

function setup() {
  const sent: VisitBatch[] = []
  const beacons: VisitBatch[] = []
  const transport = {
    send: vi.fn(async (batch: VisitBatch) => {
      sent.push(batch)
    }),
    beacon: vi.fn((batch: VisitBatch) => {
      beacons.push(batch)
      return true
    }),
  }
  const tracker = createTracker(transport)
  const uninstall = tracker.install()
  cleanups.push(uninstall)
  return { tracker, transport, sent, beacons, events: () => sent.flatMap((b) => b.events) }
}

const cleanups: (() => void)[] = []

function button(html: string) {
  document.body.innerHTML = html
  return document.body.firstElementChild as HTMLElement
}

beforeEach(() => {
  sessionStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('tracker', () => {
  it('waits for the sign-in check, then sends the visit with where it started', async () => {
    const { tracker, sent } = setup()
    tracker.pageview('/apps?utm_source=linkedin')
    button('<button>Check it on App Store</button>').click()

    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS * 2)
    expect(sent).toHaveLength(0)

    tracker.setMode('on')
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS)

    expect(sent).toHaveLength(1)
    expect(sent[0].session).toMatchObject({ path: '/apps?utm_source=linkedin', language: navigator.language })
    expect(sent[0].events.map(({ seq, type, path, label }) => ({ seq, type, path, label }))).toEqual([
      { seq: 1, type: 'pageview', path: '/apps?utm_source=linkedin', label: undefined },
      { seq: 2, type: 'click', path: '/apps?utm_source=linkedin', label: 'Check it on App Store' },
    ])
    expect(sent[0].events[0].ageMs).toBeGreaterThanOrEqual(FLUSH_DELAY_MS * 3)
  })

  it('sends the theme the visit started in, and the one on show now', async () => {
    const { tracker, sent } = setup()
    document.documentElement.dataset.theme = 'vice'
    tracker.pageview('/')
    document.documentElement.dataset.theme = 'dark'

    tracker.setMode('on')
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS)

    expect(sent[0].session).toMatchObject({ theme: 'vice', currentTheme: 'dark' })
  })

  it('records nothing for the signed-in admin', async () => {
    const { tracker, sent } = setup()
    tracker.pageview('/')
    tracker.setMode('off')
    button('<button>Edit</button>').click()

    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS * 2)

    expect(sent).toHaveLength(0)
    expect(tracker.state.queued).toEqual([])
  })

  it('counts the same page twice in a row once', () => {
    const { tracker } = setup()
    tracker.pageview('/apps')
    tracker.pageview('/apps')
    tracker.pageview('/apps?page=2')

    expect(tracker.state.queued.map((e) => e.path)).toEqual(['/apps', '/apps?page=2'])
  })

  it('keeps the visit across a reload in the same tab, numbering on', () => {
    const first = createTracker({ send: vi.fn(), beacon: vi.fn() })
    first.pageview('/')
    first.pageview('/apps')

    const second = createTracker({ send: vi.fn(), beacon: vi.fn() })
    second.pageview('/apps')

    expect(second.state.sessionId).toBe(first.state.sessionId)
    expect(second.state.queued[0].seq).toBe(3)
  })

  describe('clicks', () => {
    it('records what the visitor saw: the label, or the text', () => {
      const { tracker } = setup()
      button('<button aria-label="Close"><svg></svg></button>').click()
      button('<div role="tab"><span>About   Me</span></div>').querySelector('span')!.click()

      expect(tracker.state.queued.map((e) => [e.label, e.detail?.element])).toEqual([
        ['Close', 'button'],
        ['About Me', 'div[role=tab]'],
      ])
    })

    it("never records what's typed in a field, only its label", () => {
      const { tracker } = setup()
      document.body.innerHTML = '<label for="email">Email</label><input id="email" type="email" value="ada@example.com">'
      document.querySelector('input')!.click()

      const [click] = tracker.state.queued
      expect(click.label).toBe('Email')
      expect(JSON.stringify(click)).not.toContain('ada@example.com')
    })

    it("keeps this site's links whole and other sites' without their query", () => {
      const { tracker } = setup()
      button('<a href="/apps?page=2">Next</a>').click()
      button('<a href="https://apps.apple.com/app/id1?token=secret">App Store</a>').click()

      expect(tracker.state.queued.map((e) => e.detail?.href)).toEqual(['/apps?page=2', 'https://apps.apple.com/app/id1'])
    })

    it("records a label's click once, on its field", () => {
      const { tracker } = setup()
      document.body.innerHTML = '<label title="Dark mode"><input type="radio" name="theme" aria-label="Dark mode"></label>'
      document.querySelector('label')!.click()

      expect(tracker.state.queued.map((e) => [e.label, e.detail?.element, e.detail?.checked])).toEqual([['Dark mode', 'input[type=radio]', 'true']])
    })

    it('ignores clicks on plain text', () => {
      const { tracker } = setup()
      button('<p>Just words</p>').click()

      expect(tracker.state.queued).toEqual([])
    })
  })

  describe('errors', () => {
    it('records script errors with where they happened and the stack', () => {
      const { tracker } = setup()
      const error = new TypeError("Cannot read properties of undefined (reading 'title')")
      window.dispatchEvent(new ErrorEvent('error', { message: `Uncaught ${error}`, filename: 'http://localhost/src/AppsPage.tsx', lineno: 12, colno: 5, error }))

      const [event] = tracker.state.queued
      expect(event).toMatchObject({ type: 'error', label: `Uncaught ${error}` })
      expect(event.detail).toMatchObject({ kind: 'script', source: 'http://localhost/src/AppsPage.tsx:12:5' })
      expect(event.detail?.stack).toContain('TypeError')
    })

    it("records files that didn't load", () => {
      const { tracker } = setup()
      const image = button('<img src="/api/files/missing.webp" alt="">')
      image.dispatchEvent(new Event('error'))

      expect(tracker.state.queued[0]).toMatchObject({ type: 'error', label: "Couldn't load an image", detail: { kind: 'resource', src: '/api/files/missing.webp' } })
    })

    it('records requests that fail on the server or get no answer, not 4xx answers', async () => {
      const { tracker } = setup()
      server.use(http.get(`${API}/api/firstname`, () => new HttpResponse(null, { status: 500 })))
      await expect(api.profile.getFirstName()).rejects.toThrow()
      server.use(http.get(`${API}/api/firstname`, () => new HttpResponse(null, { status: 404 })))
      await expect(api.profile.getFirstName()).rejects.toThrow()

      expect(tracker.state.queued.map((e) => e.label)).toEqual(['GET /api/firstname failed (500)'])
    })

    it('records React crashes with the component stack', () => {
      const { tracker } = setup()
      tracker.reactError(new Error('boom'), '\n    at AppsPage\n    at App', false)

      expect(tracker.state.queued[0]).toMatchObject({ type: 'error', label: 'Error: boom', detail: { kind: 'react-crash', componentStack: 'at AppsPage\n    at App' } })
    })

    it('records the same error at most five times', () => {
      const { tracker } = setup()
      for (let i = 0; i < 20; i++) tracker.reactError(new Error('loop'), undefined, false)

      expect(tracker.state.queued).toHaveLength(5)
    })
  })

  it('records leaving and hands everything to the browser as the tab closes', () => {
    const { tracker, beacons, sent } = setup()
    tracker.setMode('on')
    tracker.pageview('/')

    window.dispatchEvent(new Event('pagehide'))

    expect(sent).toHaveLength(0)
    expect(beacons.flatMap((b) => b.events.map((e) => e.type))).toEqual(['pageview', 'leave'])
    expect(tracker.state.queued).toEqual([])
  })

  it('tries a failed batch again later', async () => {
    const { tracker, transport, events } = setup()
    transport.send.mockRejectedValueOnce(new Error('offline'))
    tracker.setMode('on')
    tracker.pageview('/')

    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS)
    expect(events()).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS)
    expect(events().map((e) => e.type)).toEqual(['pageview'])
  })
})
