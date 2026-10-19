import { failureOf } from '../../../services/api'
import type { FieldErrors } from '../../../components/fields'

/** Section titles by the first part of an API error key, for errors raised by another section. */
export const SECTION_TITLES: Record<string, string> = {
  photoUrl: 'Photo and links',
  statuses: 'Photo and links',
  links: 'Photo and links',
  contact: 'Photo and links',
  places: "Where I've been",
  'colors.places': "Where I've been",
  problemSolving: 'Problem solving',
  skills: 'Skills',
  'colors.skills': 'Skills',
  experience: 'Work experience',
  education: 'Education',
  papers: 'Academic papers',
  qualifications: 'Qualifications',
  languages: 'Languages',
  licences: 'Licences',
  hackathons: 'Hackathons',
}

/** Whether an API error key belongs to one of the prefixes: "skills" owns "skills", "skills[2].name" and "skills.x". */
export const owns = (prefixes: string[], key: string) => prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}.`) || key.startsWith(`${prefix}[`))

/** "skills[2].periods[0].uses" → "Skills, item 3". */
export function describeErrorKey(key: string): string {
  const section = Object.keys(SECTION_TITLES).find((prefix) => owns([prefix], key))
  const title = section ? SECTION_TITLES[section] : key
  const index = /^[a-z]+\[(\d+)\]/i.exec(key)?.[1]
  return index === undefined ? title : `${title}, item ${Number(index) + 1}`
}

/**
 * Why a section couldn't be saved: its field errors (first message each), and a message. The whole
 * page is saved, so an error in another section is spelled out (up to three) instead of shown in place.
 */
export function describeSaveError(error: unknown, errorKeys: string[]): { errors: FieldErrors; message: string } {
  const { status, validationErrors } = failureOf(error)
  if (validationErrors) {
    const errors: FieldErrors = {}
    const elsewhere: string[] = []
    for (const [key, messages] of Object.entries(validationErrors)) {
      errors[key] = messages[0]
      if (!owns(errorKeys, key)) elsewhere.push(`${describeErrorKey(key)}: ${messages[0]}`)
    }
    if (elsewhere.length > 0) {
      const more = elsewhere.length > 3 ? ` (and ${elsewhere.length - 3} more)` : ''
      return { errors, message: `Couldn't save, because another section needs fixing first. ${elsewhere.slice(0, 3).join(' ')}${more}` }
    }
    return { errors, message: 'Some fields need fixing; see the messages above.' }
  }
  if (status === 401) return { errors: {}, message: 'Your session has ended. Sign in again, then save.' }
  return { errors: {}, message: "Couldn't save. Please try again." }
}
