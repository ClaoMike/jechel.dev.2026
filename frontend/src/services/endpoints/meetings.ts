/** Meetings booked with Cal.com: the booking link, and the admin's calendar. */

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
}

export interface MeetingDecision {
  status: MeetingStatus
  /** False when there was a message but it couldn't be emailed (the decision still stands). */
  emailSent: boolean
}

export const meetingsEndpoints = {
  /** Public. The Cal.com booking page ("username/event"), or "" when meetings aren't offered. */
  async info(signal?: AbortSignal): Promise<string> {
    const { calLink } = await get<{ calLink: string }>('/api/meetings/info', { signal })
    return calLink
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
