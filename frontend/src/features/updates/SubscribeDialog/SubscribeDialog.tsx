import { Modal } from '../../../components/Modal/Modal'
import { useSubscribeDialogViewModel } from './SubscribeDialog.viewModel'

/** "Get updates": an email address, then a confirmation email (double opt-in). */
export function SubscribeDialog({ onClose }: { onClose: () => void }) {
  const { inputRef, ...vm } = useSubscribeDialogViewModel()
  const { id, status, error } = vm

  return (
    <Modal labelledBy={`${id}-title`} onClose={onClose} initialFocus={inputRef}>
      <div className="modal-header">
        <h2 id={`${id}-title`}>Get updates</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {status.kind === 'done' ? (
        <div className="subscribe-sent">
          <p role="status">
            {status.result === 'alreadySubscribed' ? (
              <>
                <strong>{status.email}</strong> is already subscribed: you'll get an email when there's something new.
              </>
            ) : status.result === 'pending' ? (
              <>
                We already sent a confirmation to <strong>{status.email}</strong>. Click the link in that email to confirm.
              </>
            ) : (
              <>
                Almost there: check <strong>{status.email}</strong> and click the link in the email to confirm.
              </>
            )}
          </p>
          {status.result !== 'alreadySubscribed' && <p className="muted">Nothing arrived? Look in spam, or try again in 10 minutes.</p>}
          <button type="button" className="button" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <form className="subscribe-form" onSubmit={vm.submit} noValidate>
          <p>Get an email when there's a new app or YouTube video. No spam, and you can unsubscribe from any email in one click.</p>
          <div className="field">
            <label htmlFor={`${id}-email`}>Email</label>
            <input
              ref={inputRef}
              id={`${id}-email`}
              type="email"
              autoComplete="email"
              value={vm.email}
              onChange={(e) => vm.setEmail(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
            />
            {error && (
              <p id={`${id}-error`} className="field-error">
                {error}
              </p>
            )}
          </div>
          {status.kind === 'failed' && <p role="alert">{status.message}</p>}
          <div className="subscribe-actions">
            <button type="submit" className="button" disabled={vm.sending}>
              {vm.sending ? 'Subscribing…' : 'Subscribe'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
