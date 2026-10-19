import { useId } from 'react'
import type { FieldErrors } from '../../../../components/fields'
import { SKILL_USES, type AboutColors, type SkillPeriod, type SkillUse } from '../../../../services/api'
import { SKILL_USE_LABELS } from '../../legend'

export interface PeriodEditorProps {
  /** For the remove button: "period 2 of skill 3". */
  name: string
  /** The group's name: "Period 2". */
  label: string
  period: SkillPeriod
  colors: AboutColors['skills']
  /** Its errors' prefix: "skills[2].periods[1]". */
  errorKey: string
  errors: FieldErrors
  onChange: (period: SkillPeriod) => void
  onRemove: () => void
}

/** From, to (or still using it) and what it was used for. */
export function usePeriodEditorViewModel({ period, colors, errorKey, errors, onChange }: PeriodEditorProps) {
  const set = (patch: Partial<SkillPeriod>) => onChange({ ...period, ...patch })
  return {
    ongoingId: useId(),
    ongoing: period.end === null,
    startError: errors[`${errorKey}.start`],
    endError: errors[`${errorKey}.end`],
    usesError: errors[`${errorKey}.uses`],
    setStart: (start: string) => set({ start }),
    setEnd: (end: string) => set({ end }),
    // Unticking "still using it" ends it where it started; the admin moves the end from there.
    setOngoing: (ongoing: boolean) => set({ end: ongoing ? null : period.start }),
    setUses: (uses: SkillUse[]) => set({ uses }),
    useOptions: SKILL_USES,
    useLabel: (use: SkillUse) => SKILL_USE_LABELS[use],
    useColor: (use: SkillUse) => colors[use],
  }
}
