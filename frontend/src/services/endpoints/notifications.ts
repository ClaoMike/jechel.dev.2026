/** Notifications (admin only): every kind of phone alert, switched on or off, and the history of what was raised. */

import { type Page, get, http } from '../http'

/** What became of an alert: on the phone, held back (its kind is off), ntfy not set up, or ntfy refused it. */
export type NotificationStatus = 'sent' | 'off' | 'not-set-up' | 'failed'

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

  /** Admin only. Newest first, of every kind or one. */
  list(page = 1, pageSize = 20, kind: string | null = null, signal?: AbortSignal): Promise<Page<Notification>> {
    return get<Page<Notification>>('/api/notifications', { params: { page, pageSize, ...(kind ? { kind } : {}) }, signal })
  },
}
