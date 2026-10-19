import type { AboutColors, Skill, SkillPeriod } from '../../../services/api'
import { currentMonth } from '../format'

/** The Skills section's value: the skills, and the colour of each use. */
export interface SkillsValue {
  skills: Skill[]
  colors: AboutColors['skills']
}

/** Months since year 0: "2020-03-01" → 2020 * 12 + 2. */
export function monthIndex(date: string): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1
}

/** The period's months as [start, end), ongoing periods ending this month. */
function span(period: SkillPeriod, now: Date): [number, number] {
  return [monthIndex(period.start), monthIndex(period.end ?? currentMonth(now)) + 1]
}

/**
 * How many months the skill has been used, up to now. Overlapping periods count once, and
 * the future doesn't count.
 */
export function monthsUsed(skill: Skill, now = new Date()): number {
  const nowEnd = monthIndex(currentMonth(now)) + 1
  const spans = skill.periods.map((p) => span(p, now)).map(([s, e]): [number, number] => [s, Math.min(e, nowEnd)]).filter(([s, e]) => e > s)
  spans.sort((a, b) => a[0] - b[0])
  let total = 0
  let coveredUntil = -Infinity
  for (const [start, end] of spans) {
    const from = Math.max(start, coveredUntil)
    if (end > from) total += end - from
    coveredUntil = Math.max(coveredUntil, end)
  }
  return total
}

/** "3 months", "1 year", "6 years": whole years from a year on, rounded to the nearest. */
export function formatExperience(months: number): string {
  if (months < 12) return months === 1 ? '1 month' : `${months} months`
  const years = Math.round(months / 12)
  return years === 1 ? '1 year' : `${years} years`
}

/** The chart's time axis, in months: from the January of the earliest start to the end of this year (or the latest end). */
export function chartRange(skills: Skill[], now = new Date()): { from: number; to: number } {
  const periods = skills.flatMap((s) => s.periods)
  const thisYearEnd = (now.getFullYear() + 1) * 12
  if (periods.length === 0) return { from: thisYearEnd - 12, to: thisYearEnd }
  const starts = periods.map((p) => monthIndex(p.start))
  const ends = periods.map((p) => span(p, now)[1])
  const from = Math.floor(Math.min(...starts) / 12) * 12
  const to = Math.max(thisYearEnd, Math.ceil(Math.max(...ends) / 12) * 12)
  return { from, to }
}

/** Years to label on the axis: every year, or every 2nd/5th/10th so there are at most `max`. */
export function axisYears(range: { from: number; to: number }, max = 8): number[] {
  const first = range.from / 12
  const last = range.to / 12
  const step = [1, 2, 5, 10].find((s) => (last - first) / s <= max) ?? 10
  const years: number[] = []
  for (let year = Math.ceil(first / step) * step; year <= last; year += step) years.push(year)
  return years
}

/** Most experience first (see monthsUsed); skills with as much go by name. */
export function sortByExperience(skills: Skill[], now = new Date()): Skill[] {
  return [...skills].sort((a, b) => monthsUsed(b, now) - monthsUsed(a, now) || a.name.localeCompare(b.name))
}
