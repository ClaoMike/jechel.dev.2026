import type { PushSubscriptionJson } from '@/shared/api'
import { strings } from '@/shared/i18n'

/**
 * Whether this browser can get the site's own notifications: yes; on an iPhone or iPad, only the site added to the Home
 * Screen and opened from there (Safari itself can't); or not at all.
 */
export type PushSupport = 'supported' | 'needs-home-screen' | 'unsupported'

/** Notifications allowed, blocked (only the browser's or the phone's settings undo it), or not asked yet. */
export type PushPermission = NotificationPermission

const isAppleTouch = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes(strings.webPush.macintosh) && navigator.maxTouchPoints > 1)
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array) {
  if (!a || a.byteLength !== b.length) return false
  const bytes = new Uint8Array(a)
  return bytes.every((byte, i) => byte === b[i])
}

async function registration() {
  return navigator.serviceWorker.getRegistration('/')
}

/**
 * The browser's side of the site's own notifications: the service worker (public/sw.js) and this browser's push
 * subscription. One object, so tests can stand in for the browser.
 */
export const webPush = {
  support(): PushSupport {
    if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'supported'
    return isAppleTouch() ? 'needs-home-screen' : 'unsupported'
  },

  permission(): PushPermission {
    return 'Notification' in window ? Notification.permission : 'denied'
  },

  /** This browser's push address, when it gets the site's notifications; null when it doesn't. */
  async currentEndpoint(): Promise<string | null> {
    if (webPush.support() !== 'supported') return null
    const subscription = await (await registration())?.pushManager.getSubscription()
    return subscription?.endpoint ?? null
  },

  /**
   * Asks to allow notifications (an iPhone only asks after a tap: call it from one, first thing), then subscribes with the
   * site's key: the address and keys to give the API. Rejects when they're not allowed.
   */
  async subscribe(publicKey: string): Promise<PushSubscriptionJson> {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') throw new Error(`Notifications ${permission}`)
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    const ready = await navigator.serviceWorker.ready
    const key = fromBase64Url(publicKey)
    const existing = await ready.pushManager.getSubscription()
    // Subscribed with another key (made again): those notifications would be refused, so start over.
    if (existing && !sameKey(existing.options.applicationServerKey, key)) await existing.unsubscribe()
    const subscription =
      (existing && sameKey(existing.options.applicationServerKey, key) ? existing : null) ??
      (await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }))
    const json = subscription.toJSON()
    return { endpoint: subscription.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } }
  },

  /** This browser stops getting them. */
  async unsubscribe(): Promise<void> {
    const subscription = await (await registration())?.pushManager.getSubscription()
    await subscription?.unsubscribe()
  },

  /** What this device is, for the admin's list, e.g. "iPhone · Home Screen app", "Mac · Chrome". */
  deviceLabel(): string {
    const ua = navigator.userAgent
    const device = /iPhone/.test(ua)
      ? 'iPhone'
      : /iPad/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
        ? 'iPad'
        : /Android/.test(ua)
          ? strings.webPush.android
          : /Mac OS X/.test(ua)
            ? 'Mac'
            : /Windows/.test(ua)
              ? strings.webPush.windows
              : /Linux/.test(ua)
                ? strings.webPush.linux
                : strings.webPush.computer
    const browser = isStandalone()
      ? strings.webPush.homeScreenApp
      : /Edg\//.test(ua)
        ? strings.webPush.edge
        : /Firefox\//.test(ua)
          ? strings.webPush.firefox
          : /Chrome\//.test(ua)
            ? strings.webPush.chrome
            : /Safari\//.test(ua)
              ? strings.webPush.safari
              : strings.webPush.browser
    return `${device} · ${browser}`
  },
}
