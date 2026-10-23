import { useId, useState } from 'react'
import { failureOf, type Meeting } from '../../../services/api'
import { useCancelMeetingMutation, useDecideMeetingMutation } from '../../../store/api/meetingsApi'
import { STATUS_LABELS } from '../format'

const CAL_REFUSED = "Cal.com didn't take it. Check the API key in Settings, then try again."

/**
 * Accepting or declining a request with an optional message, or cancelling an accepted meeting with an optional
 * reason; the store updates the meeting's status everywhere it shows.
 */
export function useMeetingActionsViewModel(meeting: Meeting) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [deciding, setDeciding] = useState<'accept' | 'decline' | null>(null)
  const [decideMeeting] = useDecideMeetingMutation()
  const [cancelMeeting] = useCancelMeetingMutation()
  const [asking, setAsking] = useState(false)
  const [cancelError, setCancelError] = useState('')
  // Read once: a meeting that ends while the page is open keeps its button until the next load (the API says it's over).
  const [now] = useState(() => Date.now())

  async function decide(accept: boolean) {
    setDeciding(accept ? 'accept' : 'decline')
    setError('')
    try {
      const result = await decideMeeting({ id: meeting.id, accept, message: message.trim() }).unwrap()
      setNote(message.trim() && !result.emailSent ? "Your message couldn't be emailed; Cal.com still told them." : message.trim() ? 'Your message was emailed to them.' : '')
    } catch (e) {
      setError(failureOf(e).status === 502 ? CAL_REFUSED : "That didn't work. Please try again.")
    } finally {
      setDeciding(null)
    }
  }

  /** Rejects when it fails, so the popup says why and stays open. */
  async function cancel() {
    setCancelError('')
    try {
      await cancelMeeting({ id: meeting.id, message: message.trim() }).unwrap()
    } catch (e) {
      const { status } = failureOf(e)
      setCancelError(status === 502 ? CAL_REFUSED : status === 400 ? 'It has ended already: there is nothing to cancel.' : '')
      throw e
    }
    setMessage('')
    setNote('Cal.com emailed them.')
  }

  return {
    id: useId(),
    requested: meeting.status === 'requested',
    cancellable: meeting.status === 'accepted' && new Date(meeting.endTime).getTime() > now,
    asking,
    askToCancel: () => setAsking(true),
    closeAsk: () => {
      setAsking(false)
      setCancelError('')
    },
    cancelError,
    cancel,
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
