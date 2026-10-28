import { failureOf } from '../services/api'
import { strings } from '../strings'

/** Field errors, keyed like the API's (e.g. "experience[0].title"): the first message each. */
export type FieldErrors = Record<string, string>

/** A failed save's field errors (the API's first message per key), or null when it wasn't a validation failure. */
export function fieldErrorsOf(error: unknown): FieldErrors | null {
  const { validationErrors } = failureOf(error)
  return validationErrors && Object.fromEntries(Object.entries(validationErrors).map(([key, messages]) => [key, messages[0]]))
}

/** What to say when a save failed for another reason than the fields. */
export function saveFailedMessage(error: unknown): string {
  return failureOf(error).status === 401 ? strings.common.sessionHasEndedSign : strings.common.couldntSavePleaseTry
}
