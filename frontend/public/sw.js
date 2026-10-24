/*
 * The site's service worker: only the site's own notifications (Web Push, sent by the API's WebPushSender). It shows
 * each one, and opens its page when it's tapped. It keeps nothing and handles no requests: the site works as before.
 * Registered only when the admin allows notifications on a device (Notifications tab).
 */

// A new version takes over at once, so a tap is always handled by the newest.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  // Every push must show a notification (iPhones stop sending to a site that doesn't).
  event.waitUntil(
    self.registration.showNotification(data.title || 'jechel.dev', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin)
  // Only the site's own pages.
  const target = url.origin === self.location.origin ? url.href : self.location.origin + '/'
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((client) => 'focus' in client)
      if (open) {
        await open.focus()
        try {
          await open.navigate(target)
          return
        } catch {
          // A page this worker doesn't control can't be sent elsewhere: a new one, below.
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
