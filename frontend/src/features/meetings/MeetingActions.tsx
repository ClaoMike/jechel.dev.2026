import { useId, useState } from 'react'
import { api, ApiError, type Meeting, type MeetingStatus } from '../../services/api'
import { STATUS_LABELS } from './format'

/**
 * Accept or decline a requested meeting, with an optional message that's emailed to the person
 * (and, for a decline, given to Cal.com as the reason). Other meetings just show their status.
 */
export function MeetingActions({ meeting, onDecided }: { meeting: Meeting; onDecided: (status: MeetingStatus) => void }) {
  const id = useId()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  if (meeting.status !== 'requested') {
    return (
      <p className="meeting-status">
        <span className={`chip meeting-chip meeting-chip-${meeting.status}`}>{STATUS_LABELS[meeting.status]}</span>
        {note && <span className="muted"> {note}</span>}
      </p>
    )
  }

  async function decide(accept: boolean) {
    setBusy(accept ? 'accept' : 'decline')
    setError('')
    try {
      const result = await api.meetings.decide(meeting.id, accept, message.trim())
      setNote(message.trim() && !result.emailSent ? "Your message couldn't be emailed; Cal.com still told them." : message.trim() ? 'Your message was emailed to them.' : '')
      onDecided(result.status)
    } catch (e) {
      setError(e instanceof ApiError && e.status === 502 ? "Cal.com didn't take it. Check the API key in Settings, then try again." : "That didn't work. Please try again.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="meeting-actions">
      <div className="field">
        <label htmlFor={`${id}-message`}>Message to {meeting.attendeeName || meeting.attendeeEmail} (optional)</label>
        <textarea id={`${id}-message`} rows={2} value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} placeholder="Emailed to them with your answer." />
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="meeting-buttons">
        <button type="button" className="button button-small" disabled={busy !== null} onClick={() => void decide(true)}>
          {busy === 'accept' ? 'Accepting…' : 'Accept'}
        </button>
        <button type="button" className="button button-secondary button-small" disabled={busy !== null} onClick={() => void decide(false)}>
          {busy === 'decline' ? 'Declining…' : 'Decline'}
        </button>
      </div>
    </div>
  )
}
