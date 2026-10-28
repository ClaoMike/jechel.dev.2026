import { useId } from 'react'
import { CheckboxGroup, ItemControls, MonthField, type FieldErrors } from '../../../../components/fields'
import { SKILL_USES, type AboutColors, type SkillPeriod } from '../../../../services/api'
import { SKILL_USE_LABELS } from '../../legend'
import { strings } from '../../../../strings'

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

/** One period of a skill: from, to (or still using it), and what it was used for. */
export function PeriodEditor({ name, label, period, colors, errorKey, errors, onChange, onRemove }: PeriodEditorProps) {
  const ongoingId = useId()
  const set = (patch: Partial<SkillPeriod>) => onChange({ ...period, ...patch })

  return (
    <div className="editor-subitem" role="group" aria-label={label}>
      <div className="editor-period">
        <MonthField label={strings.common.from} value={period.start} onChange={(start) => set({ start })} error={errors[`${errorKey}.start`]} />
        {period.end !== null && <MonthField label={strings.periodEditor.to} value={period.end} onChange={(end) => set({ end })} error={errors[`${errorKey}.end`]} />}
        <div className="checkbox-field">
          {/* Unticking "still using it" ends it where it started; the admin moves the end from there. */}
          <input id={ongoingId} type="checkbox" checked={period.end === null} onChange={(e) => set({ end: e.target.checked ? null : period.start })} />
          <label htmlFor={ongoingId}>{strings.periodEditor.stillUsing}</label>
        </div>
        <ItemControls name={name} index={0} count={1} onRemove={onRemove} />
      </div>
      <CheckboxGroup
        label={strings.periodEditor.used}
        options={SKILL_USES}
        value={period.uses}
        onChange={(uses) => set({ uses })}
        labelFor={(use) => SKILL_USE_LABELS[use]}
        colorFor={(use) => colors[use]}
        error={errors[`${errorKey}.uses`]}
      />
    </div>
  )
}
