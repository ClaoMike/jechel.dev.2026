import { useId } from 'react'
import type { FieldErrors } from '../../../../components/fields'
import type { AboutColors, Skill, SkillPeriod } from '../../../../services/api'
import { currentMonth } from '../../format'
import { removeAt, replaceAt } from '../../list'
import { plainText } from '../../textLinks'
import { formatExperience, monthsUsed } from '../skills'

export interface SkillEditorProps {
  index: number
  count: number
  skill: Skill
  colors: AboutColors['skills']
  errors: FieldErrors
  open: boolean
  onToggle: () => void
  onChange: (skill: Skill) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}

/** One skill folded to a row (its name and how long) until opened; a skill with an error stays open. Its periods, changed, added or removed. */
export function useSkillEditorViewModel({ index, skill, colors, errors, open, onChange }: SkillEditorProps) {
  const key = `skills[${index}]`
  const hasError = Object.keys(errors).some((k) => k.startsWith(`${key}.`) || k === key)
  const months = monthsUsed(skill)
  const setPeriods = (periods: SkillPeriod[]) => onChange({ ...skill, periods })
  const n = skill.periods.length

  return {
    bodyId: useId(),
    legend: `Skill ${index + 1}`,
    name: `skill ${index + 1}`,
    title: plainText(skill.name).trim() || `Skill ${index + 1}`,
    meta: n === 0 ? 'no dates' : months > 0 ? formatExperience(months) : `${n} ${n === 1 ? 'period' : 'periods'}`,
    expanded: open || hasError,
    // A skill with an error can't be folded away.
    locked: hasError,
    nameError: errors[`${key}.name`],
    setName: (name: string) => onChange({ ...skill, name }),
    periods: skill.periods.map((period, p) => ({
      key: p,
      name: `period ${p + 1} of skill ${index + 1}`,
      label: `Period ${p + 1}`,
      period,
      colors,
      errorKey: `${key}.periods[${p}]`,
      errors,
      onChange: (next: SkillPeriod) => setPeriods(replaceAt(skill.periods, p, next)),
      onRemove: () => setPeriods(removeAt(skill.periods, p)),
    })),
    periodsError: errors[`${key}.periods`],
    addPeriodContext: `to skill ${index + 1}`,
    // A new period starts where the last one ended (or this month).
    addPeriod: () => setPeriods([...skill.periods, { start: skill.periods.at(-1)?.end ?? currentMonth(), end: null, uses: ['work'] }]),
  }
}
