import { useId, useRef, useState, type FormEvent } from 'react'
import { type ContactTopic, failureOf, type SendMessageRequest } from '../../../services/api'
import { EMAIL_MAX_LENGTH, MESSAGE_MAX_LENGTH, MESSAGE_MIN_LENGTH, NAME_MAX_LENGTH, validateContact, type ContactErrors, type ContactField } from '../contactRules'
import { useSendMessageMutation } from '../../../store/api/contactApi'
import { trackEvent } from '../../analytics'
import { useFeature } from '../../site/useSite'

/** tooMany: the API's limit on messages from one address in a short while (429). */
type Status = 'idle' | 'sent' | 'failed' | 'tooMany'

const EMPTY: SendMessageRequest = { name: '', email: '', message: '' }

/** The API's first error per field (it uses the same camelCase field names). */
function fromApiErrors(apiErrors: Record<string, string[]>): ContactErrors {
  const errors: ContactErrors = {}
  for (const field of ['name', 'email', 'message'] as const) {
    const first = apiErrors[field]?.[0]
    if (first) errors[field] = first
  }
  return errors
}

/**
 * The public "Contact me" form. Send stays off until every field is right; a field's error shows once it's left. Once Work with me is
 * switched on, it asks what the message is about; Work with me's own form is about a project (`topic`), with its own
 * title and words.
 */
export function ContactForm({
  topic: fixedTopic,
  title = 'Contact me',
  intro = "Have a question or an idea? Send me a message and I'll reply by email. All fields are required.",
}: {
  topic?: ContactTopic
  title?: string
  intro?: string
}) {
  // The form's values and errors: Send stays off until every field is right, and a field's error shows once it's been
  // left (then updates as you type), or when the API turns it down (until that field is changed). What it's about:
  // fixed by `topic` (Work with me's own form is about a project), or picked on the form once Work with me is switched
  // on.
  const id = useId()
  const [values, setValues] = useState<SendMessageRequest>(EMPTY)
  const [topic, setTopic] = useState<ContactTopic | ''>(fixedTopic ?? '')
  const showTopic = useFeature('workWithMe') && !fixedTopic
  const [touched, setTouched] = useState<Partial<Record<ContactField, boolean>>>({})
  const [apiErrors, setApiErrors] = useState<ContactErrors>({})
  // Fields already reported as stopping the visitor, so leaving one again doesn't report it twice.
  const reported = useRef(new Set<ContactField>())
  const [status, setStatus] = useState<Status>('idle')
  const [send, { isLoading: sending }] = useSendMessageMutation()

  const found = validateContact(values)
  const valid = Object.keys(found).length === 0
  const errors: ContactErrors = {}
  for (const field of ['name', 'email', 'message'] as const) {
    const error = apiErrors[field] ?? (touched[field] ? found[field] : undefined)
    if (error) errors[field] = error
  }

  function update(field: ContactField, value: string) {
    setValues({ ...values, [field]: value })
    if (apiErrors[field]) setApiErrors((current) => ({ ...current, [field]: undefined }))
  }

  function leave(field: ContactField) {
    // Leaving a field untouched (tabbing through) isn't a mistake yet.
    if (!values[field]) return
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }))
    if (found[field] && !reported.current.has(field)) {
      // Which fields stop people (the values are never recorded).
      reported.current.add(field)
      trackEvent('Contact form invalid', { fields: field })
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || sending) return

    setStatus('idle')
    try {
      await send({ name: values.name.trim(), email: values.email.trim(), message: values.message.trim(), ...(topic && { topic }) }).unwrap()
      setStatus('sent')
      trackEvent('Message sent', topic ? { topic } : undefined)
    } catch (error) {
      const { status: code, validationErrors } = failureOf(error)
      const turnedDown = validationErrors ? fromApiErrors(validationErrors) : {}
      trackEvent('Message not sent', { reason: Object.keys(turnedDown).length > 0 ? `invalid ${Object.keys(turnedDown).join(', ')}` : String(code || 'no response') })
      if (Object.keys(turnedDown).length > 0) setApiErrors(turnedDown)
      else setStatus(code === 429 ? 'tooMany' : 'failed')
    }
  }

  const messageLength = values.message.trim().length
  /** Send is off until every field is right (and while sending). */
  const canSend = valid && !sending && !Object.values(apiErrors).some(Boolean)
  const messageShort = messageLength > 0 && messageLength < MESSAGE_MIN_LENGTH
  const sentTo = values.email.trim()
  const reset = () => {
    setValues(EMPTY)
    setTopic(fixedTopic ?? '')
    setTouched({})
    setApiErrors({})
    reported.current.clear()
    setStatus('idle')
  }
  /** The ids and ARIA wiring of a field. */
  const fieldProps = (field: ContactField) => ({
    id: `${id}-${field}`,
    name: field,
    required: true,
    value: values[field],
    onBlur: () => leave(field),
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': [field === 'message' ? `${id}-message-hint` : '', errors[field] ? `${id}-${field}-error` : ''].filter(Boolean).join(' ') || undefined,
  })

  if (status === 'sent') {
    return (
      <section className="card contact-sent" aria-labelledby={`${id}-sent`}>
        <h2 id={`${id}-sent`}>Thank you!</h2>
        <p role="status">Your message was sent. I'll get back to you at {sentTo}.</p>
        <button type="button" className="button button-secondary" onClick={reset}>
          Send another message
        </button>
      </section>
    )
  }

  return (
    <section className="card" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      <p className="muted">{intro}</p>

      <form className="contact-form" noValidate onSubmit={(event) => void submit(event)}>
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

        {showTopic && (
          <div className="field">
            <label htmlFor={`${id}-topic`}>What's it about?</label>
            <select id={`${id}-topic`} className="select" value={topic} onChange={(e) => setTopic(e.target.value as ContactTopic | '')}>
              <option value="">A question, or anything else</option>
              <option value="project">A project: working with me</option>
            </select>
          </div>
        )}

        <div className="field">
          <label htmlFor={`${id}-message`}>Message</label>
          <textarea {...fieldProps('message')} rows={8} maxLength={MESSAGE_MAX_LENGTH} onChange={(e) => update('message', e.target.value)} />
          <div className="field-hint" id={`${id}-message-hint`}>
            <span>
              Between {MESSAGE_MIN_LENGTH} and {MESSAGE_MAX_LENGTH} characters.
            </span>
            <span className={messageShort ? 'counter counter-short' : 'counter'}>
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
        {status === 'tooMany' && (
          <p role="alert" className="form-error">
            Several messages in a short while: please try again in a few minutes.
          </p>
        )}

        <div className="contact-send">
          <button type="submit" className="button" disabled={!canSend} aria-describedby={canSend || sending ? undefined : `${id}-send-hint`}>
            {sending ? 'Sending…' : 'Send message'}
          </button>
          {!canSend && !sending && (
            <p className="field-hint" id={`${id}-send-hint`}>
              Fill in every field to send it.
            </p>
          )}
        </div>
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
