import { useId, useRef, useState, type FormEvent } from 'react'
import { failureOf, type ContactTopic, type SendMessageRequest } from '../../../services/api'
import { useSendMessageMutation } from '../../../store/api/contactApi'
import { trackEvent } from '../../analytics'
import { useFeature } from '../../site/useSite'
import { MESSAGE_MIN_LENGTH, validateContact, type ContactErrors, type ContactField } from '../contactRules'

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
 * The form's values and errors: Send stays off until every field is right, and a field's error shows once it's been
 * left (then updates as you type), or when the API turns it down (until that field is changed). What it's about: fixed by
 * `topic` (Work with me's own form is about a project), or picked on the form once Work with me is switched on.
 */
export function useContactFormViewModel({ topic: fixedTopic }: { topic?: ContactTopic } = {}) {
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
  return {
    id,
    values,
    errors,
    /** Send is off until every field is right (and while sending). */
    canSend: valid && !sending && !Object.values(apiErrors).some(Boolean),
    status,
    sending,
    messageLength,
    messageShort: messageLength > 0 && messageLength < MESSAGE_MIN_LENGTH,
    sentTo: values.email.trim(),
    showTopic,
    topic,
    setTopic,
    update,
    leave,
    submit: (event: FormEvent<HTMLFormElement>) => void submit(event),
    reset: () => {
      setValues(EMPTY)
      setTopic(fixedTopic ?? '')
      setTouched({})
      setApiErrors({})
      reported.current.clear()
      setStatus('idle')
    },
    /** The ids and ARIA wiring of a field. */
    fieldProps: (field: ContactField) => ({
      id: `${id}-${field}`,
      name: field,
      required: true,
      value: values[field],
      onBlur: () => leave(field),
      'aria-invalid': errors[field] ? true : undefined,
      'aria-describedby': [field === 'message' ? `${id}-message-hint` : '', errors[field] ? `${id}-${field}-error` : ''].filter(Boolean).join(' ') || undefined,
    }),
  }
}
