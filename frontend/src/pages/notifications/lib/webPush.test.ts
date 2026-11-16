import { afterEach, describe, expect, it, vi } from 'vitest'
import { webPush } from './webPush'

// The browser's side of the site's own notifications, against a stand-in for the browser's push and service worker.

const KEY = 'AQIDBA' // base64url of the bytes 1, 2, 3, 4
const KEY_BYTES = new Uint8Array([1, 2, 3, 4])
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'

const undo: (() => void)[] = []

/** Pretends `target` has this (an own property shadows the real one), for this test only. */
function pretend(target: object, name: string, value: unknown) {
  const own = Object.getOwnPropertyDescriptor(target, name)
  Object.defineProperty(target, name, { value, configurable: true, writable: true })
  undo.push(() => (own ? Object.defineProperty(target, name, own) : delete (target as Record<string, unknown>)[name]))
}

/** Pretends the browser hasn't got this at all ('x' in window is false). */
function without(target: object, name: string) {
  const own = Object.getOwnPropertyDescriptor(target, name)
  if (!own) throw new Error(`${name} isn't the target's own`)
  delete (target as Record<string, unknown>)[name]
  undo.push(() => Object.defineProperty(target, name, own))
}

interface FakeSubscription {
  endpoint: string
  options: { applicationServerKey: ArrayBuffer | null }
  unsubscribe: ReturnType<typeof vi.fn>
  toJSON: () => { keys?: { p256dh?: string; auth?: string } }
}

function subscription(endpoint: string, key: Uint8Array | null, keys: { p256dh?: string; auth?: string } | undefined = { p256dh: 'device-key', auth: 'device-secret' }): FakeSubscription {
  return { endpoint, options: { applicationServerKey: key ? key.slice().buffer : null }, unsubscribe: vi.fn(async () => true), toJSON: () => ({ keys }) }
}

/** A service worker whose push manager has `existing` (or nothing), and subscribes to `fresh`. */
function browser({ existing = null, fresh = subscription('https://push.example/new', KEY_BYTES), registered = true }: { existing?: FakeSubscription | null; fresh?: FakeSubscription; registered?: boolean } = {}) {
  const pushManager = { getSubscription: vi.fn(async () => existing), subscribe: vi.fn(async () => fresh) }
  const register = vi.fn(async () => ({}))
  pretend(navigator.serviceWorker, 'register', register)
  pretend(navigator.serviceWorker, 'ready', Promise.resolve({ pushManager }))
  pretend(navigator.serviceWorker, 'getRegistration', vi.fn(async () => (registered ? { pushManager } : undefined)))
  return { pushManager, register }
}

const allow = (answer: NotificationPermission) => pretend(Notification, 'requestPermission', vi.fn(async () => answer))

afterEach(() => {
  for (const step of undo.splice(0).reverse()) step()
  vi.restoreAllMocks()
})

describe('whether this browser can get them', () => {
  it('can, where there are service workers, push and notifications', () => {
    expect(webPush.support()).toBe('supported')
  })

  it("can't in Safari on an iPhone or iPad (only from the Home Screen), nor in a browser without push", () => {
    without(window, 'PushManager')
    expect(webPush.support()).toBe('unsupported')

    pretend(navigator, 'userAgent', IPHONE)
    expect(webPush.support()).toBe('needs-home-screen')

    // An iPad says it's a Mac; its touchscreen gives it away.
    pretend(navigator, 'userAgent', MAC_SAFARI)
    expect(webPush.support()).toBe('unsupported')
    pretend(navigator, 'maxTouchPoints', 5)
    expect(webPush.support()).toBe('needs-home-screen')
  })

  it("says what the browser says about allowing them, and 'denied' where there are no notifications", () => {
    expect(webPush.permission()).toBe(Notification.permission)
    without(window, 'Notification')
    expect(webPush.permission()).toBe('denied')
  })
})

describe("this browser's push address", () => {
  it('is its subscription’s, and none without a subscription, a service worker or push', async () => {
    browser({ existing: subscription('https://push.example/here', KEY_BYTES) })
    expect(await webPush.currentEndpoint()).toBe('https://push.example/here')

    browser()
    expect(await webPush.currentEndpoint()).toBeNull()

    browser({ registered: false })
    expect(await webPush.currentEndpoint()).toBeNull()

    const { pushManager } = browser({ existing: subscription('https://push.example/here', KEY_BYTES) })
    without(window, 'PushManager')
    expect(await webPush.currentEndpoint()).toBeNull()
    expect(pushManager.getSubscription).not.toHaveBeenCalled()
  })
})

describe('allowing them', () => {
  it("asks, registers the service worker for the whole site and subscribes with the site's key", async () => {
    allow('granted')
    const { pushManager, register } = browser()

    expect(await webPush.subscribe(KEY)).toEqual({ endpoint: 'https://push.example/new', keys: { p256dh: 'device-key', auth: 'device-secret' } })
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' })
    const [options] = pushManager.subscribe.mock.calls[0] as unknown as [{ userVisibleOnly: boolean; applicationServerKey: Uint8Array }]
    expect(options.userVisibleOnly).toBe(true)
    expect([...options.applicationServerKey]).toEqual([1, 2, 3, 4])
  })

  it('reads a key in the URL-safe alphabet, whatever its length', async () => {
    allow('granted')
    const { pushManager } = browser()

    // "-_-_" is +/+/ in plain base64; "AQI" needs padding.
    await webPush.subscribe('-_-_')
    await webPush.subscribe('AQI')

    const keys = pushManager.subscribe.mock.calls.map((call) => [...(call as unknown as [{ applicationServerKey: Uint8Array }])[0].applicationServerKey])
    expect(keys).toEqual([
      [251, 255, 191],
      [1, 2],
    ])
  })

  it("stops there when they aren't allowed: nothing is registered", async () => {
    for (const answer of ['denied', 'default'] as const) {
      allow(answer)
      const { register, pushManager } = browser()

      await expect(webPush.subscribe(KEY)).rejects.toThrow(`Notifications ${answer}`)
      expect(register).not.toHaveBeenCalled()
      expect(pushManager.subscribe).not.toHaveBeenCalled()
    }
  })

  it("keeps the subscription it has when it's with the site's key", async () => {
    allow('granted')
    const existing = subscription('https://push.example/kept', KEY_BYTES)
    const { pushManager } = browser({ existing })

    expect((await webPush.subscribe(KEY)).endpoint).toBe('https://push.example/kept')
    expect(existing.unsubscribe).not.toHaveBeenCalled()
    expect(pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('starts over when it was subscribed with another key (or none, or one of another length)', async () => {
    for (const key of [new Uint8Array([1, 2, 3, 9]), new Uint8Array([1, 2, 3]), null]) {
      allow('granted')
      const existing = subscription('https://push.example/old', key)
      const { pushManager } = browser({ existing })

      expect((await webPush.subscribe(KEY)).endpoint).toBe('https://push.example/new')
      expect(existing.unsubscribe).toHaveBeenCalledOnce()
      expect(pushManager.subscribe).toHaveBeenCalledOnce()
    }
  })

  it('gives empty keys rather than none when the browser leaves them out', async () => {
    allow('granted')
    browser({ fresh: subscription('https://push.example/new', KEY_BYTES, {}) })
    expect((await webPush.subscribe(KEY)).keys).toEqual({ p256dh: '', auth: '' })

    browser({ fresh: { ...subscription('https://push.example/new', KEY_BYTES), toJSON: () => ({}) } })
    expect((await webPush.subscribe(KEY)).keys).toEqual({ p256dh: '', auth: '' })
  })
})

describe('stopping them', () => {
  it('unsubscribes this browser, and does nothing where there was nothing', async () => {
    const existing = subscription('https://push.example/here', KEY_BYTES)
    browser({ existing })
    await webPush.unsubscribe()
    expect(existing.unsubscribe).toHaveBeenCalledOnce()

    browser()
    await expect(webPush.unsubscribe()).resolves.toBeUndefined()
    browser({ registered: false })
    await expect(webPush.unsubscribe()).resolves.toBeUndefined()
  })
})

describe("the device's name in the admin's list", () => {
  const standalone = (matches: boolean) => vi.spyOn(window, 'matchMedia').mockReturnValue({ matches } as MediaQueryList)

  it.each([
    [IPHONE, 'iPhone · Safari'],
    ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'iPad · Safari'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36', 'Android · Chrome'],
    [MAC_SAFARI, 'Mac · Safari'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', 'Mac · Chrome'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0', 'Windows · Edge'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Linux · Firefox'],
    ['SomeReader/3.1', 'A computer · a browser'],
  ])('%s', (userAgent, label) => {
    standalone(false)
    pretend(navigator, 'userAgent', userAgent)
    pretend(navigator, 'maxTouchPoints', 0)
    expect(webPush.deviceLabel()).toBe(label)
  })

  it('an iPad that says it’s a Mac is an iPad', () => {
    standalone(false)
    pretend(navigator, 'userAgent', MAC_SAFARI)
    pretend(navigator, 'maxTouchPoints', 5)
    expect(webPush.deviceLabel()).toBe('iPad · Safari')
  })

  it('the site opened from the Home Screen is the Home Screen app, however the phone says so', () => {
    pretend(navigator, 'userAgent', IPHONE)
    standalone(true)
    expect(webPush.deviceLabel()).toBe('iPhone · Home Screen app')

    // Older iPhones: navigator.standalone.
    standalone(false)
    pretend(navigator, 'standalone', true)
    expect(webPush.deviceLabel()).toBe('iPhone · Home Screen app')
  })
})
