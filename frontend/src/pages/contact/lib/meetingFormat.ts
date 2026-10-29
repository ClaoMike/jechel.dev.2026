import type { Meeting, MeetingStatus } from '@/shared/api'
import { strings } from '@/shared/i18n'

export const STATUS_LABELS: Record<MeetingStatus, string> = {
  requested: strings.meetingsFormat.waiting,
  accepted: strings.meetingsFormat.accepted,
  declined: strings.meetingsFormat.declined,
  cancelled: strings.meetingsFormat.cancelled,
}

/** "Thu 22 Oct, 15:00–15:30", in the viewer's time zone. */
export function formatMeetingTime(meeting: Pick<Meeting, 'startTime' | 'endTime'>): string {
  const start = new Date(meeting.startTime)
  const end = new Date(meeting.endTime)
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(start)
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
  return `${day}, ${time.format(start)}–${time.format(end)}`
}

/** The local calendar day "2026-10-22" a time falls on. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
