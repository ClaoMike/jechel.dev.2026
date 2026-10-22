/** Meetings booked with Cal.com, by invitation: the admin's booking link, and calendar. */

import { get, post } from '../http'

/** requested: waits for the admin to accept or decline. */
export type MeetingStatus = 'requested' | 'accepted' | 'declined' | 'cancelled'

/** A meeting booked with Cal.com. */
export interface Meeting {
  id: number
  title: string
  /** ISO 8601 timestamps. */
  startTime: string
  endTime: string
  attendeeName: string
  attendeeEmail: string
  attendeeTimeZone: string | null
  notes: string | null
  status: MeetingStatus
  /** Booked by someone who has written to the site (a conversation with their address); false for a stranger who found the link. */
  fromConversation?: boolean
}

export interface MeetingDecision {
  status: MeetingStatus
  /** False when there was a message but it couldn't be emailed (the decision still stands). */
  emailSent: boolean
}

export const meetingsEndpoints = {
  /** Admin only. The booking page to send in an answer ("https://cal.com/you/30min"), or "" when none is set. */
  async info(signal?: AbortSignal): Promise<string> {
    const { bookingUrl } = await get<{ bookingUrl: string }>('/api/meetings/info', { signal })
    return bookingUrl
  },

  /** Admin only. Meetings overlapping [from, to), soonest first. */
  list(from: Date, to: Date, signal?: AbortSignal): Promise<Meeting[]> {
    return get<Meeting[]>('/api/meetings', { params: { from: from.toISOString(), to: to.toISOString() }, signal })
  },

  /**
   * Admin only. Accepts or declines a requested meeting with Cal.com, and emails `message` (if any)
   * to the attendee. Rejects with a 502 ApiError when Cal.com refuses.
   */
  decide(id: number, accept: boolean, message: string): Promise<MeetingDecision> {
    return post<MeetingDecision>(`/api/meetings/${id}/${accept ? 'accept' : 'decline'}`, { message })
  },
}
