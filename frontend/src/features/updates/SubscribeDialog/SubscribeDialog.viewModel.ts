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
      if (result === 'sent') trackEvent('Subscribed')
    } catch (e) {
      const { status: code, validationErrors } = failureOf(e)
      if (validationErrors?.email) setError(validationErrors.email[0])
      else if (code === 429) setStatus({ kind: 'failed', message: 'Too many tries. Please try again in a few minutes.' })
      else setStatus({ kind: 'failed', message: "That didn't work. Please try again later." })
    }
  }

  return { id: useId(), inputRef, email, setEmail, error, status, sending, submit: (event: FormEvent<HTMLFormElement>) => void submit(event) }
}
