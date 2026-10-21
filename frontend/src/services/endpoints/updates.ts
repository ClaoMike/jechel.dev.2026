/** Email updates: subscribing, and the admin's subscribers and announcements. */

import { type Page, get, http, post } from '../http'
import type { TestResult } from './settings'

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

/** The email that asks a new subscriber to confirm. Longer texts may hold paragraphs (a blank line) and [text](url) links. */
export interface ConfirmWording {
  subject: string
  intro: string
  button: string
  /** Under the button, in grey. Optional. */
  note: string
}

/** The email about a new video or app. The subject and heading may hold {title}. */
export interface ItemWording {
  subject: string
  /** Above the item's title, in grey. */
  heading: string
  button: string
}

/** Under every email, in small grey text. Both optional. */
export interface FooterWording {
  /** Why they get it, before the Unsubscribe link (update emails only). */
  reason: string
  /** That replies aren't read, and where to write instead. */
  noReply: string
}

/** The words of the emails subscribers get. */
export interface UpdateEmailWording {
  confirm: ConfirmWording
  video: ItemWording
  app: ItemWording
  footer: FooterWording
}

export interface UpdateEmailsDocument {
  wording: UpdateEmailWording
  defaults: UpdateEmailWording
  /** ISO 8601 timestamp, or null while the defaults apply. */
  updatedAt: string | null
}

export const UPDATE_EMAIL_KINDS = ['confirm', 'video', 'app'] as const
export type UpdateEmailKind = (typeof UPDATE_EMAIL_KINDS)[number]

/** An email as a subscriber would get it. */
export interface UpdateEmailPreview {
  /** The sender it goes out from. */
  from: string
  subject: string
  html: string
  text: string
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

  /** Admin only. The wording the emails go out in, and the defaults. */
  getEmails(signal?: AbortSignal): Promise<UpdateEmailsDocument> {
    return get<UpdateEmailsDocument>('/api/updates/emails', { signal })
  },

  /** Admin only. Rejects with validationErrors keyed like "video.subject". */
  async saveEmails(wording: UpdateEmailWording): Promise<UpdateEmailsDocument> {
    const response = await http.put<UpdateEmailsDocument>('/api/updates/emails', wording)
    return response.data
  },

  /** Admin only. Back to the default wording. */
  async resetEmails(): Promise<UpdateEmailsDocument> {
    const response = await http.delete<UpdateEmailsDocument>('/api/updates/emails')
    return response.data
  },

  /** Admin only. One email in the given (unsaved) wording, about the newest app or video. */
  previewEmail(kind: UpdateEmailKind, wording: UpdateEmailWording, signal?: AbortSignal): Promise<UpdateEmailPreview> {
    return post<UpdateEmailPreview>('/api/updates/emails/preview', { kind, wording }, { signal })
  },

  /** Admin only. Sends that email to the signed-in admin, marked as a test. */
  testEmail(kind: UpdateEmailKind, wording: UpdateEmailWording): Promise<TestResult> {
    return post<TestResult>('/api/updates/emails/test', { kind, wording })
  },
}
