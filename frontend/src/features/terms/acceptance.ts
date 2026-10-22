import type { TermsDocument } from '../../services/api'

const STORAGE_KEY = 'terms.accepted'

/** Visitors accept a version of the terms: the date they last changed. A new date asks everyone again. */
export function termsVersion(terms: TermsDocument | null): string {
  if (!terms) return 'unknown'
  return terms.updatedAt ?? 'default'
}

/** The version this browser accepted, or null. Storage may be unavailable (private mode): then nothing is remembered. */
export function acceptedVersion(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function rememberAcceptance(version: string) {
  try {
    localStorage.setItem(STORAGE_KEY, version)
  } catch {
    // Accepted for this visit only.
  }
}

/** Forgets this browser's acceptance: the welcome popup asks again (the development "User" bar's reset). */
export function forgetAcceptance() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing was remembered.
  }
}
