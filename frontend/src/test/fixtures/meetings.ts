import type { Meeting } from '../../services/api'

export const BOOKING_LINK = 'https://cal.com/claudiu/30min'

/** Today at this hour (local), as an ISO timestamp: the calendar opens on today. */
export function todayAt(hour: number, minute = 0): string {
  const date = new Date()
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

/** Today: Ada (invited: she wrote first) asks for 15:00; Mallory, who never wrote, for 17:00; Bob's 10:00 is accepted. */
export function todaysMeetings(): Meeting[] {
  const meeting = (id: number, name: string, hour: number, status: Meeting['status'], fromConversation: boolean): Meeting => ({
    id,
    title: '30 min',
    startTime: todayAt(hour),
    endTime: todayAt(hour, 30),
    attendeeName: name,
    attendeeEmail: `${name.toLowerCase()}@example.com`,
    attendeeTimeZone: 'Europe/London',
    notes: name === 'Ada' ? 'About a website' : null,
    status,
    fromConversation,
  })
  return [meeting(3, 'Bob', 10, 'accepted', true), meeting(1, 'Ada', 15, 'requested', true), meeting(2, 'Mallory', 17, 'requested', false)]
}
