import { useId, useRef, useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { api, ApiError } from '../../services/api'
import { trackEvent } from '../analytics'
import { isEmail } from '../contact/contactRules'

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; email: string } | { kind: 'failed'; message: string }

/** "Get updates": an email address, then a confirmation email (double opt-in). */
export function SubscribeDialog({ onClose }: { onClose: () => void }) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = email.trim()
    if (!isEmail(value)) {
      setError('Enter a valid email address.')
      inputRef.current?.focus()
      return
    }
    setError('')
    setStatus({ kind: 'sending' })
    try {
      await api.updates.subscribe(value)
      setStatus({ kind: 'sent', email: value })
      trackEvent('Subscribed')
    } catch (e) {
      if (e instanceof ApiError && e.validationErrors?.email) {
        setError(e.validationErrors.email[0])
        setStatus({ kind: 'idle' })
      } else if (e instanceof ApiError && e.status === 429) {
        setStatus({ kind: 'failed', message: 'Too many tries. Please try again in a few minutes.' })
      } else {
        setStatus({ kind: 'failed', message: "That didn't work. Please try again later." })
      }
    }
  }

  return (
    <Modal labelledBy={`${id}-title`} onClose={onClose} initialFocus={inputRef}>
      <header className="modal-header">
        <h2 id={`${id}-title`}>Get updates</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
      </header>
      {status.kind === 'sent' ? (
        <div className="subscribe-sent">
          <p role="status">
            Almost there: check <strong>{status.email}</strong> and click the link in the email to confirm.
          </p>
          <p className="muted">Nothing arrived? Look in spam, or try again in 10 minutes.</p>
          <button type="button" className="button" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <form className="subscribe-form" onSubmit={handleSubmit} noValidate>
          <p>Get an email when there's a new app or YouTube video. No spam, and you can unsubscribe from any email in one click.</p>
          <div className="field">
            <label htmlFor={`${id}-email`}>Email</label>
            <input
              ref={inputRef}
              id={`${id}-email`}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            <button type="submit" className="button" disabled={status.kind === 'sending'}>
              {status.kind === 'sending' ? 'Subscribing…' : 'Subscribe'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
