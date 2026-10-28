import type { EducationItem, ExperienceItem } from '../../../services/api'
import { currentMonth, formatPeriod, isUpcoming } from '../format'
import { strings } from '../../../strings'

/** What experience and education have in common; `organization` is the company or the institution. */
export interface TimelineEntry {
  title: string
  organization: string
  location: string
  start: string
  end: string | null
  bullets?: string[]
}

/** One item on a timeline, ready to show (experience, education and hackathons all look like this). */
export interface TimelineItemView {
  title: string
  /** "Company · Location", as rich text parts. */
  meta: string[]
  upcoming: boolean
  /** "Sep 2019 – Jun 2022 (2 years 9 months)", or a year. */
  period: string
  /** The machine-readable date: "2019-09", or "2024". */
  dateTime: string
  bullets: string[]
}

export interface TimelineConfig<T> {
  /** API key, for field errors: "experience" → "experience[0].title". */
  key: 'experience' | 'education'
  title: string
  itemName: string
  titleLabel: string
  organizationLabel: string
  /** API field name of the organization, for its errors. */
  organizationKey: 'company' | 'institution'
  withBullets: boolean
  toEntry: (item: T) => TimelineEntry
  fromEntry: (entry: TimelineEntry) => T
}

export const EXPERIENCE: TimelineConfig<ExperienceItem> = {
  key: 'experience',
  title: strings.common.workExperience,
  itemName: 'role',
  titleLabel: strings.timeline.jobTitle,
  organizationLabel: strings.timeline.company,
  organizationKey: 'company',
  withBullets: true,
  toEntry: ({ company, ...rest }) => ({ ...rest, organization: company }),
  fromEntry: ({ organization, bullets = [], ...rest }) => ({ ...rest, company: organization, bullets }),
}

export const EDUCATION: TimelineConfig<EducationItem> = {
  key: 'education',
  title: strings.common.education,
  itemName: 'education',
  titleLabel: strings.timeline.degreeCourse,
  organizationLabel: strings.timeline.institution,
  organizationKey: 'institution',
  withBullets: false,
  toEntry: ({ institution, ...rest }) => ({ ...rest, organization: institution }),
  fromEntry: ({ organization, ...rest }) => ({ ...rest, institution: organization }),
}

/** An entry as the timeline shows it. */
export function toItemView(entry: TimelineEntry, now = new Date()): TimelineItemView {
  return {
    title: entry.title,
    meta: [entry.organization, entry.location].filter(Boolean),
    upcoming: isUpcoming(entry.start, now),
    period: formatPeriod(entry.start, entry.end, now),
    dateTime: entry.start.slice(0, 7),
    bullets: entry.bullets ?? [],
  }
}

/** A new entry: this month, ongoing, with an empty bullet to fill in when the section has them. */
export function newEntry(withBullets: boolean): TimelineEntry {
  return { title: '', organization: '', location: '', start: currentMonth(), end: null, ...(withBullets ? { bullets: [''] } : {}) }
}
