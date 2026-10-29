import type { ContactMessageDetails, ContactMessageSummary, Page } from '@/shared/api'

const LONG = 'Hello Claudiu! I played the Space Game and loved the lighthouse level. Could we talk about how you built the beam? Thanks!'

/** The admin's inbox: a conversation with a reply from the visitor (unread again), and an older one, read. */
export const INBOX: ContactMessageSummary[] = [
  { id: 1, name: 'Ada', receivedAt: '2026-10-20T09:00:00Z', isRead: false, lastActivityAt: '2026-10-22T08:30:00Z', count: 3 },
  { id: 2, name: 'Bob', receivedAt: '2026-10-21T09:00:00Z', isRead: true, lastActivityAt: '2026-10-21T09:00:00Z', count: 1 },
]

export function pageOfMessages(items: ContactMessageSummary[] = INBOX, totalCount = items.length, page = 1): Page<ContactMessageSummary> {
  return { items, page, pageSize: 10, totalCount }
}

/** Ada's conversation: her message, your answer, her reply. */
export const ADA: ContactMessageDetails = {
  id: 1,
  name: 'Ada',
  email: 'ada@example.com',
  message: LONG,
  receivedAt: '2026-10-20T09:00:00Z',
  readAt: null,
  replies: [
    { id: 10, text: 'Thanks Ada! Happy to. When suits you?', sentAt: '2026-10-21T10:00:00Z', fromVisitor: false },
    { id: 11, text: 'Tuesday at 10?', sentAt: '2026-10-22T08:30:00Z', fromVisitor: true },
  ],
  meetings: [],
}
