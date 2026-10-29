/** The longest email address there is (RFC 5321); the API keeps to it too. */
export const EMAIL_MAX_LENGTH = 254

// One address, a dotted domain, no spaces or display names. Edge cases are left to the API.
const EMAIL_PATTERN = /^[^\s@<>,]+@[^\s@<>,.]+(\.[^\s@<>,.]+)+$/

/** Looks like an email address (the contact form, the "Get updates" form). */
export function isEmail(value: string): boolean {
  return value.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(value)
}
