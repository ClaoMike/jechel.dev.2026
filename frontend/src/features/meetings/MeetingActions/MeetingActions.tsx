import { ConfirmDialog } from '../../../components/ConfirmDialog/ConfirmDialog'
import type { Meeting } from '../../../services/api'
import { formatMeetingTime } from '../format'
import { useMeetingActionsViewModel } from './MeetingActions.viewModel'

/**
 * Accept or decline a requested meeting, with an optional message that's emailed to the person
 * (and, for a decline, given to Cal.com as the reason). Other meetings show their status; an accepted
 * one that hasn't ended can be cancelled, after asking (Cal.com emails them, with the reason).
 */
export function MeetingActions({ meeting }: { meeting: Meeting }) {
  const vm = useMeetingActionsViewModel(meeting)

  if (!vm.requested) {
    return (
      <div className="meeting-status">
        <span className={`chip meeting-chip meeting-chip-${meeting.status}`}>{vm.statusLabel}</span>
        {vm.note && <span className="muted"> {vm.note}</span>}
        {vm.cancellable && (
          <button type="button" className="button button-danger button-small meeting-cancel" onClick={vm.askToCancel}>
            Cancel meeting
          </button>
        )}
        {vm.asking && (
          <ConfirmDialog title={`Cancel the meeting with ${vm.attendee}?`} confirmLabel="Cancel meeting" cancelLabel="Keep it" failure={vm.cancelError} onConfirm={vm.cancel} onClose={vm.closeAsk}>
            <p>
              {formatMeetingTime(meeting)}. Cal.com emails {vm.attendee} that it's cancelled, and frees the time in your calendar.
            </p>
            <div className="field">
              <label htmlFor={`${vm.id}-reason`}>Reason (optional)</label>
              <textarea id={`${vm.id}-reason`} rows={2} value={vm.message} maxLength={2000} onChange={(e) => vm.setMessage(e.target.value)} placeholder="In Cal.com's email to them." />
            </div>
          </ConfirmDialog>
        )}
      </div>
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
