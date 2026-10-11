import type { SendMessageRequest } from '../../services/api'

/** Mirrors the API's ContactRules.cs, for instant feedback. The API has the final say. Lengths count trimmed text. */
export const NAME_MAX_LENGTH = 100
export const EMAIL_MAX_LENGTH = 254
export const MESSAGE_MIN_LENGTH = 100
export const MESSAGE_MAX_LENGTH = 1000

export type ContactField = keyof SendMessageRequest
export type ContactErrors = Partial<Record<ContactField, string>>

// One address, a dotted domain, no spaces or display names. Edge cases are left to the API.
const EMAIL_PATTERN = /^[^\s@<>,]+@[^\s@<>,.]+(\.[^\s@<>,.]+)+$/

export function validateContact(values: SendMessageRequest): ContactErrors {
  const errors: ContactErrors = {}
  const name = values.name.trim()
  const email = values.email.trim()
  const message = values.message.trim()

  if (!name) errors.name = 'Please enter your name.'
  else if (name.length > NAME_MAX_LENGTH) errors.name = `Your name can be at most ${NAME_MAX_LENGTH} characters.`

  if (!email) errors.email = 'Please enter your email.'
  else if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) errors.email = 'Please enter a valid email address, like name@example.com.'

  if (!message) errors.message = 'Please write a message.'
  else if (message.length < MESSAGE_MIN_LENGTH)
    errors.message = `Your message needs at least ${MESSAGE_MIN_LENGTH} characters (${MESSAGE_MIN_LENGTH - message.length} more).`
  else if (message.length > MESSAGE_MAX_LENGTH) errors.message = `Your message can be at most ${MESSAGE_MAX_LENGTH} characters.`

  return errors
}
