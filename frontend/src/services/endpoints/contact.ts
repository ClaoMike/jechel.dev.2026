/** Contact: the contact form, and the admin's inbox of conversations (messages from the form or emailed to the site) and replies. */

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
  /** ISO 8601 timestamp: when anyone last wrote in the conversation (the inbox is ordered by it). */
  lastActivityAt: string
  /** Messages in the conversation, the first included. */
  count: number
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
  /** Every message after the first, oldest first: the admin's answers and the visitor's. */
  replies: ContactReply[]
  /** Meetings the same address booked (not cancelled), soonest first. */
  meetings: Meeting[]
  /** The email's subject, for a conversation that started by email. */
  subject?: string | null
}

export interface ContactReply {
  id: number
  text: string
  /** ISO 8601 timestamp. */
  sentAt: string
  /** Emailed by the visitor; false for the admin's answers. */
  fromVisitor: boolean
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

  /** Admin only. Emails the answer to the sender (from the site's address, which their answer comes back to, with what they last wrote quoted); rejects with a 503 ApiError when it can't be sent. */
  reply(id: number, text: string): Promise<ContactReply> {
    return post<ContactReply>(`/api/contact/messages/${id}/reply`, { text })
  },
}
