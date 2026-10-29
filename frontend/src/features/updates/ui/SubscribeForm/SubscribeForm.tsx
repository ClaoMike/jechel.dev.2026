import type { FormEvent, RefObject } from 'react'
import { strings } from '@/shared/i18n'

export interface SubscribeFormProps {
  inputRef: RefObject<HTMLInputElement | null>
  emailId: string
  errorId: string
  email: string
  setEmail: (email: string) => void
  /** What's wrong with the address, if anything. */
  error: string
  /** Why subscribing failed, if it did (not the address). */
  failure: string | null
  sending: boolean
  submitLabel: string
  submit: (event: FormEvent<HTMLFormElement>) => void
}

/** What the updates are, an email address, and Subscribe. */
export function SubscribeForm({ inputRef, emailId, errorId, email, setEmail, error, failure, sending, submitLabel, submit }: SubscribeFormProps) {
  return (
    <form className="subscribe-form" onSubmit={submit} noValidate>
      <p>{strings.subscribeForm.getEmailWhenTheres}</p>
      <div className="field">
        <label htmlFor={emailId}>{strings.common.email}</label>
        <input
          ref={inputRef}
          id={emailId}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {error && (
          <p id={errorId} className="field-error">
            {error}
          </p>
        )}
      </div>
      {failure && <p role="alert">{failure}</p>}
      <div className="subscribe-actions">
        <button type="submit" className="button" disabled={sending}>
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
