import { useId, useState } from 'react'
import { failureOf, type Meeting } from '../../../services/api'
import { useDecideMeetingMutation } from '../../../store/api/meetingsApi'
import { STATUS_LABELS } from '../format'

/** Accepting or declining a request with an optional message; the store updates the meeting's status everywhere it shows. */
export function useMeetingActionsViewModel(meeting: Meeting) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [deciding, setDeciding] = useState<'accept' | 'decline' | null>(null)
  const [decideMeeting] = useDecideMeetingMutation()

  async function decide(accept: boolean) {
    setDeciding(accept ? 'accept' : 'decline')
    setError('')
    try {
      const result = await decideMeeting({ id: meeting.id, accept, message: message.trim() }).unwrap()
      setNote(message.trim() && !result.emailSent ? "Your message couldn't be emailed; Cal.com still told them." : message.trim() ? 'Your message was emailed to them.' : '')
    } catch (e) {
      setError(failureOf(e).status === 502 ? "Cal.com didn't take it. Check the API key in Settings, then try again." : "That didn't work. Please try again.")
    } finally {
      setDeciding(null)
    }
  }

  return {
    id: useId(),
    requested: meeting.status === 'requested',
    statusLabel: STATUS_LABELS[meeting.status],
    attendee: meeting.attendeeName || meeting.attendeeEmail,
    message,
    setMessage,
    error,
    note,
    deciding,
    accept: () => void decide(true),
    decline: () => void decide(false),
  }
}
