/** Contact: the contact form, and the admin's inbox and replies. */

import { type Page, get, http, post } from '../http'
import type { Meeting } from './meetings'

export interface SendMessageRequest {
  name: string
  email: string
  message: string
}

export interface ContactMessageSummary {
  id: number
  name: string
  /** ISO 8601 timestamp. */
  receivedAt: string
  isRead: boolean
}

export interface ContactMessageDetails {
  id: number
  name: string
  email: string
  message: string
  /** ISO 8601 timestamp. */
  receivedAt: string
  /** ISO 8601 timestamp, or null while unread. */
  readAt: string | null
  /** What the admin answered, oldest first. */
  replies: ContactReply[]
  /** Meetings the same address booked (not cancelled), soonest first. */
  meetings: Meeting[]
}

export interface ContactReply {
  id: number
  text: string
  /** ISO 8601 timestamp. */
  sentAt: string
}

export const contactEndpoints = {
  /** Public. Rejects with an ApiError carrying `validationErrors` when a field is invalid. */
  async send(message: SendMessageRequest): Promise<void> {
    await post('/api/contact', message)
  },

  /** Admin only. Newest first. */
  listMessages(page = 1, pageSize = 10, signal?: AbortSignal): Promise<Page<ContactMessageSummary>> {
    return get<Page<ContactMessageSummary>>('/api/contact/messages', { params: { page, pageSize }, signal })
  },

  /** Admin only. Doesn't mark the message as read: call `markAsRead` for that. */
  getMessage(id: number, signal?: AbortSignal): Promise<ContactMessageDetails> {
    return get<ContactMessageDetails>(`/api/contact/messages/${id}`, { signal })
  },

  /** Admin only. Idempotent. */
  async markAsRead(id: number): Promise<void> {
    await post(`/api/contact/messages/${id}/read`)
  },

  /** Admin only. For good. */
  async deleteMessage(id: number): Promise<void> {
    await http.delete(`/api/contact/messages/${id}`)
  },

  /** Admin only. Emails the answer to the sender (with the message quoted); rejects with a 503 ApiError when it can't be sent. */
  reply(id: number, text: string): Promise<ContactReply> {
    return post<ContactReply>(`/api/contact/messages/${id}/reply`, { text })
  },
}
