import type { Meeting } from '../../../services/api'
import { useMeetingActionsViewModel } from './MeetingActions.viewModel'

/**
 * Accept or decline a requested meeting, with an optional message that's emailed to the person
 * (and, for a decline, given to Cal.com as the reason). Other meetings just show their status.
 */
export function MeetingActions({ meeting }: { meeting: Meeting }) {
  const vm = useMeetingActionsViewModel(meeting)

  if (!vm.requested) {
    return (
      <p className="meeting-status">
        <span className={`chip meeting-chip meeting-chip-${meeting.status}`}>{vm.statusLabel}</span>
        {vm.note && <span className="muted"> {vm.note}</span>}
      </p>
    )
  }

  return (
    <div className="meeting-actions">
      <div className="field">
        <label htmlFor={`${vm.id}-message`}>Message to {vm.attendee} (optional)</label>
        <textarea id={`${vm.id}-message`} rows={2} value={vm.message} maxLength={2000} onChange={(e) => vm.setMessage(e.target.value)} placeholder="Emailed to them with your answer." />
      </div>
      {vm.error && (
        <p className="field-error" role="alert">
          {vm.error}
        </p>
      )}
      <div className="meeting-buttons">
        <button type="button" className="button button-small" disabled={vm.deciding !== null} onClick={vm.accept}>
          {vm.deciding === 'accept' ? 'Accepting…' : 'Accept'}
        </button>
        <button type="button" className="button button-secondary button-small" disabled={vm.deciding !== null} onClick={vm.decline}>
          {vm.deciding === 'decline' ? 'Declining…' : 'Decline'}
        </button>
      </div>
    </div>
  )
}
