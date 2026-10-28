import { useId } from 'react'
import { AddButton, ItemControls, TextField, type FieldErrors } from '../../../../components/fields'
import { ArrowDownIcon } from '../../../../components/icons/icons'
import type { AboutColors, Skill, SkillPeriod } from '../../../../services/api'
import { currentMonth } from '../../format'
import { removeAt, replaceAt } from '../../list'
import { plainText } from '../../textLinks'
import { PeriodEditor } from '../PeriodEditor/PeriodEditor'
import { formatExperience, monthsUsed } from '../skills'
import { strings } from '../../../../strings'

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

/** One skill, folded to a row (its name, how long, move and remove) until clicked open. A skill with an error is always open. */
export function SkillEditor({ index, count, skill, colors, errors, open, onToggle, onChange, onMove, onRemove }: SkillEditorProps) {
  const bodyId = useId()
  const key = `skills[${index}]`
  // A skill with an error can't be folded away.
  const hasError = Object.keys(errors).some((k) => k.startsWith(`${key}.`) || k === key)
  const expanded = open || hasError
  const months = monthsUsed(skill)
  const n = skill.periods.length
  const setPeriods = (periods: SkillPeriod[]) => onChange({ ...skill, periods })

  return (
    <fieldset className="editor-item accordion-item">
      <legend className="visually-hidden">
        {strings.skillEditor.skill}
        {index + 1}
      </legend>
      <div className="accordion-header">
        <button type="button" className="accordion-toggle" aria-expanded={expanded} aria-controls={bodyId} onClick={onToggle} disabled={hasError}>
          <ArrowDownIcon size={16} />
          <span className="accordion-title">{plainText(skill.name).trim() || strings.skillEditor.skill2(index + 1)}</span>
          <span className="muted accordion-meta">{n === 0 ? strings.skillEditor.noDates : months > 0 ? formatExperience(months) : strings.skillEditor.periods(n)}</span>
        </button>
        <ItemControls name={`skill ${index + 1}`} index={index} count={count} onMove={onMove} onRemove={onRemove} />
      </div>
      <div id={bodyId} className="accordion-body" hidden={!expanded}>
        <TextField label={strings.skillEditor.skill3} value={skill.name} required onChange={(name) => onChange({ ...skill, name })} error={errors[`${key}.name`]} />
        <div className="editor-subitems">
          {n === 0 && <p className="muted editor-note">{strings.skillEditor.noDatesYetAdd}</p>}
          {skill.periods.map((period, p) => (
            <PeriodEditor
              key={p}
              name={`period ${p + 1} of skill ${index + 1}`}
              label={strings.skillEditor.period(p + 1)}
              period={period}
              colors={colors}
              errorKey={`${key}.periods[${p}]`}
              errors={errors}
              onChange={(next) => setPeriods(replaceAt(skill.periods, p, next))}
              onRemove={() => setPeriods(removeAt(skill.periods, p))}
            />
          ))}
          {errors[`${key}.periods`] && <p className="field-error">{errors[`${key}.periods`]}</p>}
          {/* A new period starts where the last one ended (or this month). */}
          <AddButton onClick={() => setPeriods([...skill.periods, { start: skill.periods.at(-1)?.end ?? currentMonth(), end: null, uses: ['work'] }])}>
            {strings.skillEditor.addPeriod}
            <span className="visually-hidden">
              {strings.skillEditor.skill4}
              {index + 1}
            </span>
          </AddButton>
        </div>
      </div>
    </fieldset>
  )
}
