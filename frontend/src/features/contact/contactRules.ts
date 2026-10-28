import type { SendMessageRequest } from '../../services/api'
import { strings } from '../../strings'

/** Mirrors the API's ContactRules.cs, for instant feedback. The API has the final say. Lengths count trimmed text. */
export const NAME_MAX_LENGTH = 100
export const EMAIL_MAX_LENGTH = 254
export const MESSAGE_MIN_LENGTH = 100
export const MESSAGE_MAX_LENGTH = 1000

/** A project enquiry's subject (the API's ContactRules.ProjectSubject): the inbox marks those messages. */
export const PROJECT_ENQUIRY = strings.contactRules.projectEnquiry

export type ContactField = Exclude<keyof SendMessageRequest, 'topic'>
export type ContactErrors = Partial<Record<ContactField, string>>

// One address, a dotted domain, no spaces or display names. Edge cases are left to the API.
const EMAIL_PATTERN = /^[^\s@<>,]+@[^\s@<>,.]+(\.[^\s@<>,.]+)+$/

/** Looks like an email address (also used by the "Get updates" form). */
export function isEmail(value: string): boolean {
  return value.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(value)
}

export function validateContact(values: SendMessageRequest): ContactErrors {
  const errors: ContactErrors = {}
  const name = values.name.trim()
  const email = values.email.trim()
  const message = values.message.trim()

  if (!name) errors.name = strings.contactRules.pleaseEnterName
  else if (name.length > NAME_MAX_LENGTH) errors.name = strings.contactRules.nameCanMostCharacters(NAME_MAX_LENGTH)

  if (!email) errors.email = strings.contactRules.pleaseEnterEmail
  else if (!isEmail(email)) errors.email = strings.contactRules.pleaseEnterValidEmail

  if (!message) errors.message = strings.contactRules.pleaseWriteMessage
  else if (message.length < MESSAGE_MIN_LENGTH) errors.message = strings.contactRules.messageNeedsLeastCharacters(MESSAGE_MIN_LENGTH, MESSAGE_MIN_LENGTH - message.length)
  else if (message.length > MESSAGE_MAX_LENGTH) errors.message = strings.contactRules.messageCanMostCharacters(MESSAGE_MAX_LENGTH)

  return errors
}
