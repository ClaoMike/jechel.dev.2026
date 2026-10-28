import { failureOf } from '../../../services/api'
import type { FieldErrors } from '../../../components/fields'
import { strings } from '../../../strings'

/** Section titles by the first part of an API error key, for errors raised by another section. */
export const SECTION_TITLES: Record<string, string> = {
  photoUrl: strings.saveError.photoLinks,
  statuses: strings.saveError.photoLinks,
  links: strings.saveError.photoLinks,
  contact: strings.saveError.photoLinks,
  places: strings.saveError.whereIveBeen,
  'colors.places': strings.saveError.whereIveBeen,
  problemSolving: strings.saveError.problemSolving,
  skills: strings.common.skills,
  'colors.skills': strings.common.skills,
  experience: strings.common.workExperience,
  education: strings.common.education,
  papers: strings.common.academicPapers,
  qualifications: strings.common.qualifications,
  languages: strings.common.languages,
  licences: strings.common.licences,
  hackathons: strings.common.hackathons,
}

/** Whether an API error key belongs to one of the prefixes: "skills" owns "skills", "skills[2].name" and "skills.x". */
export const owns = (prefixes: string[], key: string) => prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}.`) || key.startsWith(`${prefix}[`))

/** "skills[2].periods[0].uses" → "Skills, item 3". */
export function describeErrorKey(key: string): string {
  const section = Object.keys(SECTION_TITLES).find((prefix) => owns([prefix], key))
  const title = section ? SECTION_TITLES[section] : key
  const index = /^[a-z]+\[(\d+)\]/i.exec(key)?.[1]
  return index === undefined ? title : strings.saveError.item(title, Number(index) + 1)
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
      return { errors, message: strings.saveError.couldntSaveBecauseAnother(elsewhere.slice(0, 3).join(' '), more) }
    }
    return { errors, message: strings.saveError.someFieldsNeedFixing }
  }
  if (status === 401) return { errors: {}, message: strings.common.sessionHasEndedSign }
  return { errors: {}, message: strings.common.couldntSavePleaseTry }
}
