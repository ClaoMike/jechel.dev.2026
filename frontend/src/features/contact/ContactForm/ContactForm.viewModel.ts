import { useId, useState, type FormEvent } from 'react'
import { failureOf, type SendMessageRequest } from '../../../services/api'
import { useSendMessageMutation } from '../../../store/api/contactApi'
import { trackEvent } from '../../analytics'
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

/** The form's values and errors: they show after the first submit, then update as you type. */
export function useContactFormViewModel() {
  const id = useId()
  const [values, setValues] = useState<SendMessageRequest>(EMPTY)
  const [errors, setErrors] = useState<ContactErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [send, { isLoading: sending }] = useSendMessageMutation()

  function update(field: ContactField, value: string) {
    const next = { ...values, [field]: value }
    setValues(next)
    if (submitted) setErrors(validateContact(next))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)

    const found = validateContact(values)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      // Which fields stop people (the values are never recorded).
      trackEvent('Contact form invalid', { fields: Object.keys(found).join(', ') })
      const firstInvalid = (['name', 'email', 'message'] as const).find((field) => found[field])
      document.getElementById(`${id}-${firstInvalid}`)?.focus()
      return
    }

    setStatus('idle')
    try {
      await send({ name: values.name.trim(), email: values.email.trim(), message: values.message.trim() }).unwrap()
      setStatus('sent')
      trackEvent('Message sent')
    } catch (error) {
      const { status: code, validationErrors } = failureOf(error)
      const apiErrors = validationErrors ? fromApiErrors(validationErrors) : {}
      trackEvent('Message not sent', { reason: Object.keys(apiErrors).length > 0 ? `invalid ${Object.keys(apiErrors).join(', ')}` : String(code || 'no response') })
      if (Object.keys(apiErrors).length > 0) setErrors(apiErrors)
      else setStatus(code === 429 ? 'tooMany' : 'failed')
    }
  }

  const messageLength = values.message.trim().length
  return {
    id,
    values,
    errors,
    status,
    sending,
    messageLength,
    messageShort: messageLength > 0 && messageLength < MESSAGE_MIN_LENGTH,
    sentTo: values.email.trim(),
    update,
    submit: (event: FormEvent<HTMLFormElement>) => void submit(event),
    reset: () => {
      setValues(EMPTY)
      setErrors({})
      setSubmitted(false)
      setStatus('idle')
    },
    /** The ids and ARIA wiring of a field. */
    fieldProps: (field: ContactField) => ({
      id: `${id}-${field}`,
      name: field,
      required: true,
      value: values[field],
      'aria-invalid': errors[field] ? true : undefined,
      'aria-describedby': [field === 'message' ? `${id}-message-hint` : '', errors[field] ? `${id}-${field}-error` : ''].filter(Boolean).join(' ') || undefined,
    }),
  }
}
