import { describe, expect, it, vi } from 'vitest'

// public/sw.js, the service worker behind the site's own notifications, run against a stand-in for the browser's worker
// scope: what it shows for a push, and where a tap goes.

type Handler = (event: Record<string, unknown>) => void
const ORIGIN = 'https://jechel.dev'

async function worker({ windows = [] as { focus: () => Promise<void>; navigate: (url: string) => Promise<unknown> }[] } = {}) {
  const code = await (await fetch('/sw.js')).text()
  const handlers: Record<string, Handler> = {}
  const self = {
    location: new URL(ORIGIN),
    addEventListener: (type: string, handler: Handler) => (handlers[type] = handler),
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn(async () => {}) },
    clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async () => windows), openWindow: vi.fn(async () => null) },
  }
  new Function('self', code)(self)
  /** Runs the event's handler, then waits for what it handed to waitUntil. */
  const fire = async (type: string, event: Record<string, unknown>) => {
    let work: Promise<unknown> = Promise.resolve()
    handlers[type]({ ...event, waitUntil: (promise: Promise<unknown>) => (work = promise) })
    await work
  }
  return { self, fire }
}

const push = (payload: unknown) => ({ data: { json: () => (typeof payload === 'string' ? JSON.parse(payload) : payload), text: () => String(payload) } })

describe('the service worker', () => {
  it('shows a push as a notification: its title, its text, the site’s icon, and the page to open', async () => {
    const { self, fire } = await worker()
    await fire('push', push({ title: 'New message from Ada', body: 'Hello', url: `${ORIGIN}/contact` }))
    expect(self.registration.showNotification).toHaveBeenCalledWith('New message from Ada', {
      body: 'Hello',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: `${ORIGIN}/contact` },
    })
  })

  it('shows something for every push, even one it can’t read (an iPhone stops sending to a site that doesn’t)', async () => {
    const { self, fire } = await worker()
    await fire('push', { data: { json: () => JSON.parse('not json'), text: () => 'plain words' } })
    await fire('push', { data: null })
    expect(self.registration.showNotification).toHaveBeenNthCalledWith(1, 'jechel.dev', expect.objectContaining({ body: 'plain words', data: { url: '/' } }))
    expect(self.registration.showNotification).toHaveBeenNthCalledWith(2, 'jechel.dev', expect.objectContaining({ body: '' }))
  })

  it('a tap with the site open brings it forward, on the notification’s page', async () => {
    const open = { focus: vi.fn(async () => {}), navigate: vi.fn(async () => null) }
    const { self, fire } = await worker({ windows: [open] })
    const notification = { close: vi.fn(), data: { url: `${ORIGIN}/contact` } }
    await fire('notificationclick', { notification })
    expect(notification.close).toHaveBeenCalled()
    expect(open.focus).toHaveBeenCalled()
    expect(open.navigate).toHaveBeenCalledWith(`${ORIGIN}/contact`)
    expect(self.clients.openWindow).not.toHaveBeenCalled()
  })

  it('a tap with the site closed opens it on that page; with one it can’t move, a new one', async () => {
    const closed = await worker()
    await closed.fire('notificationclick', { notification: { close: vi.fn(), data: { url: `${ORIGIN}/community` } } })
    expect(closed.self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/community`)

    const stuck = { focus: vi.fn(async () => {}), navigate: vi.fn(async () => Promise.reject(new TypeError('not controlled'))) }
    const other = await worker({ windows: [stuck] })
    await other.fire('notificationclick', { notification: { close: vi.fn(), data: { url: `${ORIGIN}/community` } } })
    expect(other.self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/community`)
  })

  it('only ever opens the site’s own pages', async () => {
    const { self, fire } = await worker()
    await fire('notificationclick', { notification: { close: vi.fn(), data: { url: 'https://evil.example/phish' } } })
    expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`)
  })

  it('takes over at once when updated', async () => {
    const { self, fire } = await worker()
    await fire('install', {})
    await fire('activate', {})
    expect(self.skipWaiting).toHaveBeenCalled()
    expect(self.clients.claim).toHaveBeenCalled()
  })
})
