import type { AlertChannelState, Notification, NotificationKind, Page, PushSetup } from '../../services/api'

/** The kinds as the API lists them (AlertKinds.cs), some with alerts lately. */
export const KINDS: NotificationKind[] = [
  { kind: 'message', label: 'New message', group: 'Visitors', enabled: true, last30Days: 4, lastAt: '2026-10-22T20:15:00Z' },
  { kind: 'meeting-request', label: 'Meeting request', group: 'Visitors', enabled: true, last30Days: 0, lastAt: null },
  { kind: 'meeting-change', label: 'Meeting booked, moved or cancelled', group: 'Visitors', enabled: true, last30Days: 0, lastAt: null },
  { kind: 'meeting-reminder', label: 'Meeting reminder', group: 'Visitors', enabled: true, last30Days: 0, lastAt: null },
  { kind: 'coffee', label: 'Buy Me a Coffee', group: 'Community', enabled: true, last30Days: 2, lastAt: '2026-10-21T09:00:00Z' },
  { kind: 'subscriber', label: 'New subscriber', group: 'Community', enabled: true, last30Days: 1, lastAt: '2026-10-21T20:56:00Z' },
  { kind: 'new-app', label: 'New app to email', group: 'Community', enabled: true, last30Days: 0, lastAt: null },
  { kind: 'update-sent', label: 'Update email sent', group: 'Community', enabled: true, last30Days: 0, lastAt: null },
  { kind: 'email-failing', label: 'Emails not going out', group: 'Problems', enabled: true, last30Days: 0, lastAt: null },
  { kind: 'site-error', label: 'Site error', group: 'Problems', enabled: false, last30Days: 7, lastAt: '2026-10-22T18:00:00Z' },
  { kind: 'api-crash', label: 'API crash', group: 'Problems', enabled: true, last30Days: 0, lastAt: null },
  { kind: 'sign-in', label: 'Signed in', group: 'Security', enabled: true, last30Days: 9, lastAt: '2026-10-22T19:00:00Z' },
  { kind: 'sign-in-refused', label: 'Sign-in refused', group: 'Security', enabled: true, last30Days: 0, lastAt: null },
]

export const NOTIFICATIONS: Notification[] = [
  { id: 3, kind: 'message', title: 'New message from Ada', message: 'Hello! I loved the Space Game.', path: '/contact', status: 'sent', createdAt: '2026-10-22T20:15:00Z', sentTo: ['ntfy', 'push'] },
  {
    id: 2,
    kind: 'site-error',
    title: 'Site error',
    message: 'TypeError: x is undefined\non /apps (Chrome, desktop)',
    path: '/engagement',
    status: 'off',
    createdAt: '2026-10-22T18:00:00Z',
    sentTo: [],
  },
  { id: 1, kind: 'sign-in', title: 'Signed in to jechel.dev', message: 'Chrome on macOS · 203.0.113.7 (GB)', path: null, status: 'failed', createdAt: '2026-10-22T09:00:00Z', sentTo: [] },
]

export function pageOfNotifications(items: Notification[] = NOTIFICATIONS, totalCount = items.length, page = 1): Page<Notification> {
  return { items, page, pageSize: 20, totalCount }
}

export const CHANNELS: AlertChannelState[] = [
  { channel: 'ntfy', enabled: true, ready: true },
  { channel: 'push', enabled: true, ready: true },
]

/** A made-up device; `here` is this browser's push address in the tests that allow notifications. */
export const HERE = 'https://web.push.apple.com/this-device'

export const PUSH: PushSetup = {
  publicKey: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
  devices: [
    { id: 2, label: 'iPhone · Home Screen app', endpoint: HERE, createdAt: '2026-10-24T16:00:00Z', lastSentAt: '2026-10-24T17:30:00Z' },
    { id: 1, label: 'Mac · Chrome', endpoint: 'https://fcm.googleapis.com/fcm/send/mac', createdAt: '2026-10-23T09:00:00Z', lastSentAt: null },
  ],
}

