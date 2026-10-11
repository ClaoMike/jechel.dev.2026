import { useId, useState, type FormEvent } from 'react'
import { api, ApiError, type SendMessageRequest } from '../../services/api'
import {
  EMAIL_MAX_LENGTH,
  MESSAGE_MAX_LENGTH,
  MESSAGE_MIN_LENGTH,
  NAME_MAX_LENGTH,
  validateContact,
  type ContactErrors,
  type ContactField,
} from './contactRules'

type Status = 'idle' | 'sending' | 'sent' | 'failed'

const EMPTY: SendMessageRequest = { name: '', email: '', message: '' }

/** The public "Contact me" form. Errors show after the first submit, then update as you type. */
export function ContactForm() {
  const id = useId()
  const [values, setValues] = useState<SendMessageRequest>(EMPTY)
  const [errors, setErrors] = useState<ContactErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const [status, setStatus] = useState<Status>('idle')

  const messageLength = values.message.trim().length

  function update(field: ContactField, value: string) {
    const next = { ...values, [field]: value }
    setValues(next)
    if (submitted) setErrors(validateContact(next))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)

    const found = validateContact(values)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      const firstInvalid = (['name', 'email', 'message'] as const).find((field) => found[field])
      document.getElementById(`${id}-${firstInvalid}`)?.focus()
      return
    }

    setStatus('sending')
    try {
      await api.contact.send({ name: values.name.trim(), email: values.email.trim(), message: values.message.trim() })
      setStatus('sent')
    } catch (error) {
      const apiErrors = error instanceof ApiError && error.validationErrors ? fromApiErrors(error.validationErrors) : {}
      if (Object.keys(apiErrors).length > 0) {
        setErrors(apiErrors)
        setStatus('idle')
      } else {
        setStatus('failed')
      }
    }
  }

  function reset() {
    setValues(EMPTY)
    setErrors({})
    setSubmitted(false)
    setStatus('idle')
  }

  if (status === 'sent') {
    return (
      <section className="card contact-sent" aria-labelledby={`${id}-sent`}>
        <h2 id={`${id}-sent`}>Thank you!</h2>
        <p role="status">Your message was sent. I'll get back to you at {values.email.trim()}.</p>
        <button type="button" className="button button-secondary" onClick={reset}>
          Send another message
        </button>
      </section>
    )
  }

  const fieldProps = (field: ContactField) => ({
    id: `${id}-${field}`,
    name: field,
    required: true,
    value: values[field],
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': [field === 'message' ? `${id}-message-hint` : '', errors[field] ? `${id}-${field}-error` : '']
      .filter(Boolean)
      .join(' ') || undefined,
  })

  return (
    <section className="card" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Contact me</h2>
      <p className="muted">Have a question or an idea? Send me a message and I'll reply by email. All fields are required.</p>

      <form className="contact-form" noValidate onSubmit={(event) => void handleSubmit(event)}>
        <div className="field">
          <label htmlFor={`${id}-name`}>Name</label>
          <input {...fieldProps('name')} type="text" autoComplete="name" maxLength={NAME_MAX_LENGTH} onChange={(e) => update('name', e.target.value)} />
          <FieldError id={`${id}-name-error`} error={errors.name} />
        </div>

        <div className="field">
          <label htmlFor={`${id}-email`}>Email</label>
          <input {...fieldProps('email')} type="email" autoComplete="email" maxLength={EMAIL_MAX_LENGTH} onChange={(e) => update('email', e.target.value)} />
          <FieldError id={`${id}-email-error`} error={errors.email} />
        </div>

        <div className="field">
          <label htmlFor={`${id}-message`}>Message</label>
          <textarea {...fieldProps('message')} rows={8} maxLength={MESSAGE_MAX_LENGTH} onChange={(e) => update('message', e.target.value)} />
          <div className="field-hint" id={`${id}-message-hint`}>
            <span>
              Between {MESSAGE_MIN_LENGTH} and {MESSAGE_MAX_LENGTH} characters.
            </span>
            <span className={messageLength > 0 && messageLength < MESSAGE_MIN_LENGTH ? 'counter counter-short' : 'counter'}>
              {messageLength} / {MESSAGE_MAX_LENGTH}
            </span>
          </div>
          <FieldError id={`${id}-message-error`} error={errors.message} />
        </div>

        {status === 'failed' && (
          <p role="alert" className="form-error">
            Your message couldn't be sent. Please try again in a moment.
          </p>
        )}

        <button type="submit" className="button" disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Send message'}
        </button>
      </form>
    </section>
  )
}

function FieldError({ id, error }: { id: string; error: string | undefined }) {
  if (!error) return null
  return (
    <p className="field-error" id={id}>
      {error}
    </p>
  )
}

/** The API's first error per field (it uses the same camelCase field names). */
function fromApiErrors(apiErrors: Record<string, string[]>): ContactErrors {
  const errors: ContactErrors = {}
  for (const field of ['name', 'email', 'message'] as const) {
    const first = apiErrors[field]?.[0]
    if (first) errors[field] = first
  }
  return errors
}
