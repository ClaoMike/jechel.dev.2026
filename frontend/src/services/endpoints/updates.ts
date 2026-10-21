/** Email updates: subscribing, and the admin's subscribers and announcements. */

import { type Page, get, http, post } from '../http'

export type SubscribeStatus = 'sent' | 'alreadySubscribed' | 'pending'

export interface Subscriber {
  id: number
  email: string
  /** ISO 8601 timestamp. */
  createdAt: string
  /** Null until they click the link in the confirmation email. */
  confirmedAt: string | null
}

/** pending: a new app waiting for the admin; approved: to be emailed (once Get updates is on for visitors). */
export type AnnouncementStatus = 'pending' | 'approved' | 'sent' | 'ignored'

/** Something new to email the subscribers about. */
export interface Announcement {
  id: number
  kind: 'app' | 'video'
  title: string
  status: AnnouncementStatus
  /** ISO 8601 timestamp. */
  createdAt: string
  /** ISO 8601 timestamp, or null until emailed. */
  sentAt: string | null
  recipientCount: number
}

export const updatesEndpoints = {
  /**
   * Public. Emails a confirmation link: "sent"; or nothing, when they're "alreadySubscribed" or a
   * confirmation went out lately ("pending"). Rejects with validationErrors.email, a 429 when tried
   * too often, or a 503 when the email couldn't be sent.
   */
  async subscribe(email: string): Promise<SubscribeStatus> {
    const { status } = await post<{ status: SubscribeStatus }>('/api/updates/subscribe', { email })
    return status
  },

  /** Public. The link in the confirmation email; resolves with the address. Rejects with a 404 for an unknown token. */
  async confirm(token: string): Promise<string> {
    const { email } = await post<{ email: string }>('/api/updates/confirm', undefined, { params: { token } })
    return email
  },

  /** Public. The link in every update email. */
  async unsubscribe(token: string): Promise<void> {
    await post('/api/updates/unsubscribe', undefined, { params: { token } })
  },

  /** Admin only. Newest first, confirmed or not. */
  listSubscribers(page = 1, pageSize = 20, signal?: AbortSignal): Promise<Page<Subscriber>> {
    return get<Page<Subscriber>>('/api/updates/subscribers', { params: { page, pageSize }, signal })
  },

  /** Admin only. */
  async deleteSubscriber(id: number): Promise<void> {
    await http.delete(`/api/updates/subscribers/${id}`)
  },

  /** Admin only. A pending announcement: email it (`send`) or not (`ignore`). */
  async decide(id: number, decision: 'send' | 'ignore'): Promise<AnnouncementStatus> {
    const { status } = await post<{ status: AnnouncementStatus }>(`/api/updates/announcements/${id}/${decision}`)
    return status
  },

  /** Admin only. Newest first, with whether each was emailed. */
  listAnnouncements(page = 1, pageSize = 20, signal?: AbortSignal): Promise<Page<Announcement>> {
    return get<Page<Announcement>>('/api/updates/announcements', { params: { page, pageSize }, signal })
  },
}
