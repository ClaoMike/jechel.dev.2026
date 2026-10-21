import { useId, useRef, useState, type FormEvent } from 'react'
import { failureOf, type SubscribeStatus } from '../../../services/api'
import { useSubscribeMutation } from '../../../store/api/communityApi'
import { trackEvent } from '../../analytics'
import { isEmail } from '../../contact/contactRules'

type Status = { kind: 'idle' } | { kind: 'done'; email: string; result: SubscribeStatus } | { kind: 'failed'; message: string }

/** An email address, then a confirmation email (double opt-in). */
export function useSubscribeDialogViewModel() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [subscribe, { isLoading: sending }] = useSubscribeMutation()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = email.trim()
    if (!isEmail(value)) {
      setError('Enter a valid email address.')
      inputRef.current?.focus()
      return
    }
    setError('')
    setStatus({ kind: 'idle' })
    try {
      const result = await subscribe(value).unwrap()
      setStatus({ kind: 'done', email: value, result })
      trackEvent(result === 'sent' ? 'Subscribed' : result === 'pending' ? 'Subscribed again (not confirmed yet)' : 'Subscribed again (already subscribed)')
    } catch (e) {
      const { status: code, validationErrors } = failureOf(e)
      trackEvent('Subscribing failed', { reason: validationErrors?.email ? 'invalid address' : code === 429 ? 'too many tries' : String(code || 'no response') })
      if (validationErrors?.email) setError(validationErrors.email[0])
      else if (code === 429) setStatus({ kind: 'failed', message: 'Too many tries. Please try again in a few minutes.' })
      // Switched off (Settings → Visitor pages) since the page loaded.
      else if (code === 404) setStatus({ kind: 'failed', message: "Email updates aren't open right now. Please try again later." })
      else setStatus({ kind: 'failed', message: "That didn't work. Please try again later." })
    }
  }

  const id = useId()
  const done = status.kind === 'done' ? status : null
  const sent: Record<SubscribeStatus, [string, string]> = {
    sent: ['Almost there: check ', ' and click the link in the email to confirm.'],
    pending: ['We already sent a confirmation to ', '. Click the link in that email to confirm.'],
    alreadySubscribed: ['', " is already subscribed: you'll get an email when there's something new."],
  }

  return {
    titleId: `${id}-title`,
    inputRef,
    form: {
      emailId: `${id}-email`,
      errorId: `${id}-error`,
      email,
      setEmail,
      error,
      failure: status.kind === 'failed' ? status.message : null,
      sending,
      submitLabel: sending ? 'Subscribing…' : 'Subscribe',
      submit: (event: FormEvent<HTMLFormElement>) => void submit(event),
    },
    sent: done && {
      before: sent[done.result][0],
      email: done.email,
      after: sent[done.result][1],
      hint: done.result === 'alreadySubscribed' ? null : 'Nothing arrived? Look in spam, or try again in 10 minutes.',
    },
  }
}
