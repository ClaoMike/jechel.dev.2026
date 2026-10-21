/** The résumé generator: its settings and the generated PDFs. */

import { API_BASE_URL, get, http, post } from '../http'

/** The parts of About Me a résumé can include, in print order (ResumeSections.cs). */
export const RESUME_SECTIONS = [
  'statuses',
  'links',
  'experience',
  'skills',
  'education',
  'qualifications',
  'papers',
  'hackathons',
  'problemSolving',
  'languages',
  'licences',
  'places',
] as const

export type ResumeSection = (typeof RESUME_SECTIONS)[number]

/** The résumé's contact details: edited with the About Me profile, but never on the public page. */
export interface ResumeContact {
  /** Private: only in the admin's copy. */
  phone: string
  email: string
  /** Under the name, e.g. "Full-stack engineer · .NET, React, PostgreSQL". */
  headline: string
}

/** What the generator puts in. */
export interface ResumeChoices {
  sections: ResumeSection[]
  /** Names of the About Me skills to leave out. */
  excludedSkills: string[]
}

export interface ResumeSettingsDetails extends ResumeContact, ResumeChoices {
  /** ISO 8601 timestamp of the last generation, or null before the first. */
  generatedAt: string | null
}

export const resumeEndpoints = {
  /** Public: the last generated résumé, without the phone number. */
  publicUrl: `${API_BASE_URL}/api/resume`,

  /** Admin only: the same résumé with the phone number. */
  privateUrl: `${API_BASE_URL}/api/resume/private`,

  /** Admin only. */
  getSettings(signal?: AbortSignal): Promise<ResumeSettingsDetails> {
    return get<ResumeSettingsDetails>('/api/resume/settings', { signal })
  },

  /** Admin only. The phone, email and headline. Rejects with validationErrors (phone, email, headline). */
  async saveContact(contact: ResumeContact): Promise<ResumeSettingsDetails> {
    const response = await http.put<ResumeSettingsDetails>('/api/resume/contact', contact)
    return response.data
  },

  /** Admin only. Saves the sections and skills without generating. */
  async saveChoices(choices: ResumeChoices): Promise<ResumeSettingsDetails> {
    const response = await http.put<ResumeSettingsDetails>('/api/resume/choices', choices)
    return response.data
  },

  /**
   * Admin only. Saves the choices, then makes both PDFs from the About Me page and the saved contact
   * details; the page's "Download résumé" button then gets the one without the phone number.
   */
  generate(choices: ResumeChoices): Promise<ResumeSettingsDetails> {
    return post<ResumeSettingsDetails>('/api/resume/generate', choices)
  },
}
