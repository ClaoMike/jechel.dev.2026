import { useId, useState } from 'react'
import { ConfirmDialog } from '../../../components/ConfirmDialog/ConfirmDialog'
import { type Meeting, failureOf } from '../../../services/api'
import { formatMeetingTime, STATUS_LABELS } from '../format'
import { useCancelMeetingMutation, useDecideMeetingMutation } from '../../../store/api/meetingsApi'
import { strings } from '../../../strings'

const CAL_REFUSED = strings.meetingActions.calComDidntTake

/**
 * Accept or decline a requested meeting, with an optional message that's emailed to the person
 * (and, for a decline, given to Cal.com as the reason). Other meetings show their status; an accepted
 * one that hasn't ended can be cancelled, after asking (Cal.com emails them, with the reason).
 */
export function MeetingActions({ meeting }: { meeting: Meeting }) {
  // Accepting or declining a request with an optional message, or cancelling an accepted meeting with an optional
  // reason; the store updates the meeting's status everywhere it shows.
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [deciding, setDeciding] = useState<'accept' | 'decline' | null>(null)
  const [decideMeeting] = useDecideMeetingMutation()
  const [cancelMeeting] = useCancelMeetingMutation()
  const [asking, setAsking] = useState(false)
  const [cancelError, setCancelError] = useState('')
  // Read once: a meeting that ends while the page is open keeps its button until the next load (the API says it's
  // over).
  const [now] = useState(() => Date.now())

  async function decide(accept: boolean) {
    setDeciding(accept ? 'accept' : 'decline')
    setError('')
    try {
      const result = await decideMeeting({ id: meeting.id, accept, message: message.trim() }).unwrap()
      setNote(message.trim() && !result.emailSent ? strings.meetingActions.messageCouldntEmailedCal : message.trim() ? strings.meetingActions.messageWasEmailedThem : '')
    } catch (e) {
      setError(failureOf(e).status === 502 ? CAL_REFUSED : strings.common.didntWorkPleaseTry)
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
      setCancelError(status === 502 ? CAL_REFUSED : status === 400 ? strings.meetingActions.hasEndedAlreadyThere : '')
      throw e
    }
    setMessage('')
    setNote(strings.meetingActions.calComEmailedThem)
  }
  const id = useId()
  const requested = meeting.status === 'requested'
  const cancellable = meeting.status === 'accepted' && new Date(meeting.endTime).getTime() > now
  const askToCancel = () => setAsking(true)
  const closeAsk = () => {
    setAsking(false)
    setCancelError('')
  }
  const statusLabel = STATUS_LABELS[meeting.status]
  const attendee = meeting.attendeeName || meeting.attendeeEmail
  const accept = () => void decide(true)
  const decline = () => void decide(false)

  if (!requested) {
    return (
      <div className="meeting-status">
        <span className={`chip meeting-chip meeting-chip-${meeting.status}`}>{statusLabel}</span>
        {note && <span className="muted"> {note}</span>}
        {cancellable && (
          <button type="button" className="button button-danger button-small meeting-cancel" onClick={askToCancel}>
            {strings.meetingActions.cancelMeeting}
          </button>
        )}
        {asking && (
          <ConfirmDialog
            title={strings.meetingActions.cancelMeeting2(attendee)}
            confirmLabel={strings.meetingActions.cancelMeeting}
            cancelLabel={strings.meetingActions.keep}
            failure={cancelError}
            onConfirm={cancel}
            onClose={closeAsk}
          >
            <p>
              {formatMeetingTime(meeting)}
              {strings.meetingActions.calComEmails}
              {attendee} {strings.meetingActions.cancelledFreesTimeCalendar}
            </p>
            <div className="field">
              <label htmlFor={`${id}-reason`}>{strings.meetingActions.reasonOptional}</label>
              <textarea
                id={`${id}-reason`}
                rows={2}
                value={message}
                maxLength={2000}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={strings.meetingActions.calComsEmailThem}
              />
            </div>
          </ConfirmDialog>
        )}
      </div>
    )
  }

  return (
    <div className="meeting-actions">
      <div className="field">
        <label htmlFor={`${id}-message`}>
          {strings.meetingActions.message}
          {attendee} {strings.meetingActions.optional}
        </label>
        <textarea
          id={`${id}-message`}
          rows={2}
          value={message}
          maxLength={2000}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={strings.meetingActions.emailedThemAnswer}
        />
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="meeting-buttons">
        <button type="button" className="button button-small" disabled={deciding !== null} onClick={accept}>
          {deciding === 'accept' ? strings.meetingActions.accepting : strings.meetingActions.accept}
        </button>
        <button type="button" className="button button-secondary button-small" disabled={deciding !== null} onClick={decline}>
          {deciding === 'decline' ? strings.meetingActions.declining : strings.meetingActions.decline}
        </button>
      </div>
    </div>
  )
}
