/** About Me: the profile page (photo, experience, skills, places…), read by visitors and edited by the admin. */

import { get, http } from '../http'

/** Free text in the About Me page may contain links written as [text](https://…); see features/about/textLinks. */
export interface AboutContent {
  /** Empty: show a placeholder. An uploaded photo is a /api/files/… path. */
  photoUrl: string
  /** Labels shown under the photo, e.g. "Romanian citizenship" with the Romanian flag. */
  statuses: Status[]
  links: AboutLinks
  colors: AboutColors
  places: Place[]
  problemSolving: ProblemSolving
  skills: Skill[]
  /** In the order the admin chose. */
  experience: ExperienceItem[]
  /** In the order the admin chose. */
  education: EducationItem[]
  papers: Paper[]
  qualifications: Qualification[]
  languages: Language[]
  licences: Licence[]
  hackathons: Hackathon[]
}

/** A citizenship or residence label. */
export interface Status {
  text: string
  /** ISO 3166 country code ("RO", "GB"), "EU", or empty for no flag. */
  flag: string
}

export interface Paper {
  title: string
  /** The uploaded PDF (/api/files/…), or empty: the title isn't a link then. */
  fileUrl: string
}

export const NEETCODE_LISTS = ['blind75', 'neetcode150', 'neetcode250'] as const
export type NeetCodeList = (typeof NEETCODE_LISTS)[number]

/** The "Problem solving" section. */
export interface ProblemSolving {
  /** Empty hides the LeetCode stats. */
  leetCodeUsername: string
  /** Completed lists, in NEETCODE_LISTS order. */
  neetCodeLists: NeetCodeList[]
}

export const LANGUAGE_LEVELS = ['native', 'fluent', 'advanced', 'intermediate', 'beginner'] as const
export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number]

export interface Language {
  name: string
  level: LanguageLevel
}

export const LICENCE_CATEGORIES = ['driving', 'flying', 'boating', 'other'] as const
export type LicenceCategory = (typeof LICENCE_CATEGORIES)[number]

/** A driving, flying or boating licence; see features/about/licences for the ones offered. */
export interface Licence {
  category: LicenceCategory
  /** Short code, e.g. "B" or "PPL(A)"; may be empty. */
  code: string
  /** What it allows, e.g. "Car". */
  name: string
}

export interface Hackathon {
  /** May contain links. */
  name: string
  year: number
  bullets: string[]
}

/** Empty strings hide the link. */
export interface AboutLinks {
  /** An uploaded résumé is a /api/files/… path. */
  resumeUrl: string
  gitHubUrl: string
  linkedInUrl: string
  instagramUrl: string
}

export const SKILL_USES = ['work', 'academic', 'personal'] as const
export type SkillUse = (typeof SKILL_USES)[number]

export const VISIT_KINDS = ['worked', 'studied', 'visited'] as const
export type VisitKind = (typeof VISIT_KINDS)[number]

/** Legend colours, "#rrggbb". */
export interface AboutColors {
  skills: Record<SkillUse, string>
  places: Record<VisitKind, string>
}

export interface Skill {
  name: string
  /** Empty for skills saved before they had periods: shown without a bar. */
  periods: SkillPeriod[]
}

export interface SkillPeriod {
  /** First of a month, "YYYY-MM-01". */
  start: string
  /** First of a month, or null while still in use. */
  end: string | null
  /** At least one; the API stores them in SKILL_USES order. */
  uses: SkillUse[]
}

/** A city on the "Where I've been" map. */
export interface Place {
  /** GeoNames id, from the city search. */
  id: number
  name: string
  region: string
  country: string
  latitude: number
  longitude: number
  /** At least one; the API stores them in VISIT_KINDS order. */
  visits: PlaceVisit[]
}

export interface PlaceVisit {
  kind: VisitKind
  /** Optional, may contain links: "BSc at [Uni](https://…)". */
  note: string
}

export interface ExperienceItem {
  title: string
  /** May be a link: "[Acme](https://acme.example)". */
  company: string
  location: string
  /** First of a month, "YYYY-MM-01". May be in the future. */
  start: string
  /** First of a month, or null while ongoing. */
  end: string | null
  bullets: string[]
}

export interface EducationItem {
  /** The degree or course. */
  title: string
  /** May be a link: "[The University of Manchester](https://www.manchester.ac.uk)". */
  institution: string
  location: string
  start: string
  end: string | null
}

export interface Qualification {
  title: string
  /** Optional. */
  issuer: string
  /** First of a month, or null when not given. */
  obtained: string | null
  /** Optional, e.g. "First Class". */
  grade: string
}

export const aboutEndpoints = {
  /** Public. Placeholder content until the admin first saves the page. */
  get(signal?: AbortSignal): Promise<AboutContent> {
    return get<AboutContent>('/api/about', { signal })
  },

  /**
   * Admin only. Replaces the whole page; resolves with it as stored (trimmed).
   * Rejects with an ApiError whose `validationErrors` are keyed by path, e.g. "experience[0].title".
   */
  async update(content: AboutContent): Promise<AboutContent> {
    const response = await http.put<AboutContent>('/api/about', content)
    return response.data
  },
}
