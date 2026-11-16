/** Notifications (admin only): every kind of phone alert, switched on or off, and the history of what was raised. */

import { type Page, get, http, post } from '../http'

/**
 * What became of an alert: sent (one way or both), held back (its kind is off), no way set up (no ntfy topic, no
 * device), every way failed, or both ways switched off.
 */
export type NotificationStatus = 'sent' | 'off' | 'not-set-up' | 'failed' | 'no-channel'

/** The ways alerts go: the ntfy app, and the site's own notifications (Web Push) on the devices that allowed them. */
export type AlertChannel = 'ntfy' | 'push'

export interface AlertChannelState {
  channel: AlertChannel
  enabled: boolean
  /** Whether it can deliver now: ntfy has a topic; the site's own notifications have a device. */
  ready: boolean
}

/** A device that allowed the site's own notifications. */
export interface PushDevice {
  id: number
  /** What it is, e.g. "iPhone · Home Screen app". */
  label: string
  /** Its address at its push service: tells this device from the others. */
  endpoint: string
  /** ISO 8601 timestamps. */
  createdAt: string
  lastSentAt: string | null
}

export interface PushSetup {
  /** The site's key, which a browser needs to allow its notifications. */
  publicKey: string
  /** The newest first. */
  devices: PushDevice[]
}

/** A browser's PushSubscription, as toJSON() gives it. */
export interface PushSubscriptionJson {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** One kind of phone alert. */
export interface NotificationKind {
  /** E.g. "message", "coffee", "sign-in". */
  kind: string
  label: string
  /** The heading it's listed under: "Visitors", "Community", "Problems" or "Security". */
  group: string
  enabled: boolean
  /** How many were raised in the last 30 days, sent or not. */
  last30Days: number
  /** ISO 8601 timestamp of the last one, or null when none has come. */
  lastAt: string | null
}

/** An alert the site raised. */
export interface Notification {
  id: number
  kind: string
  title: string
  message: string
  /** Where tapping it went on the site, e.g. "/contact". */
  path: string | null
  status: NotificationStatus
  /** ISO 8601 timestamp. */
  createdAt: string
  /** Where it went, once sent; empty when it wasn't. */
  sentTo: AlertChannel[]
}

export const notificationsEndpoints = {
  /** Admin only. Every kind, grouped, in order. */
  listKinds(signal?: AbortSignal): Promise<NotificationKind[]> {
    return get<NotificationKind[]>('/api/notifications/kinds', { signal })
  },

  /** Admin only. Switches one kind on or off; resolves with every kind as it now is. */
  async saveKind(kind: string, enabled: boolean): Promise<NotificationKind[]> {
    const response = await http.put<NotificationKind[]>(`/api/notifications/kinds/${encodeURIComponent(kind)}`, { enabled })
    return response.data
  },

  /** Admin only. Both ways alerts go, each on or off, and whether it can deliver now. */
  listChannels(signal?: AbortSignal): Promise<AlertChannelState[]> {
    return get<AlertChannelState[]>('/api/notifications/channels', { signal })
  },

  /** Admin only. Switches one way on or off; resolves with both as they now are. */
  async saveChannel(channel: AlertChannel, enabled: boolean): Promise<AlertChannelState[]> {
    const response = await http.put<AlertChannelState[]>(`/api/notifications/channels/${channel}`, { enabled })
    return response.data
  },

  /** Admin only. The site's key and the devices that allowed its notifications. */
  getPush(signal?: AbortSignal): Promise<PushSetup> {
    return get<PushSetup>('/api/notifications/push', { signal })
  },

  /** Admin only. A device allowed them (or allowed them again); resolves with every device. */
  addPushDevice(subscription: PushSubscriptionJson, label: string): Promise<PushDevice[]> {
    return post<PushDevice[]>('/api/notifications/push/devices', { ...subscription, label })
  },

  /** Admin only. Stops sending to it; resolves with the devices left. */
  async removePushDevice(id: number): Promise<PushDevice[]> {
    const response = await http.delete<PushDevice[]>(`/api/notifications/push/devices/${id}`)
    return response.data
  },

  /** Admin only. A test notification to that device alone. Rejects with a 502 ApiError when its push service refused it. */
  async testPushDevice(id: number): Promise<void> {
    await http.post(`/api/notifications/push/devices/${id}/test`)
  },

  /** Admin only. Newest first, of every kind or one. */
  list(page = 1, pageSize = 20, kind: string | null = null, signal?: AbortSignal): Promise<Page<Notification>> {
    return get<Page<Notification>>('/api/notifications', { params: { page, pageSize, ...(kind ? { kind } : {}) }, signal })
  },
}
