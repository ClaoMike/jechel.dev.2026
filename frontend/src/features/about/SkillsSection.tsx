import { useId, useState } from 'react'
import { SKILL_USES, type AboutColors, type Skill, type SkillPeriod } from '../../services/api'
import { EditableSection } from './EditableSection'
import { AddButton, CheckboxGroup, ColorField, ItemControls, MonthField, TextField, type EditorProps, type FieldErrors } from './fields'
import { currentMonth, formatPeriod } from './format'
import { SKILL_USE_LABELS, splitBackground } from './legend'
import { move, removeAt, replaceAt } from './list'
import { axisYears, chartRange, formatExperience, monthIndex, monthsUsed } from './skills'

export interface SkillsValue {
  skills: Skill[]
  colors: AboutColors['skills']
}

export function SkillsSection({ value, canEdit, onSave }: { value: SkillsValue; canEdit: boolean; onSave: (value: SkillsValue) => Promise<void> }) {
  return (
    <EditableSection title="Skills" errorKeys={['skills', 'colors.skills']} value={value} canEdit={canEdit} onSave={onSave} editor={SkillsEditor}>
      {value.skills.length === 0 ? <p className="muted">No skills yet.</p> : <SkillsChart skills={value.skills} colors={value.colors} />}
    </EditableSection>
  )
}

/**
 * A timeline: one row per skill, a bar for each period it was used, coloured by what it was
 * used for (split into bands when it was several things). Each row ends with the total
 * experience. Hovering or focusing a bar shows its details; the same details are in the
 * list's text for screen readers.
 */
export function SkillsChart({ skills, colors, now: fixedNow }: { skills: Skill[]; colors: AboutColors['skills']; now?: Date }) {
  const [now] = useState(() => fixedNow ?? new Date())
  const range = chartRange(skills, now)
  const at = (month: number) => `${((month - range.from) / (range.to - range.from)) * 100}%`
  const nowMonth = monthIndex(currentMonth(now))
  const usedUses = SKILL_USES.filter((use) => skills.some((s) => s.periods.some((p) => p.uses.includes(use))))

  return (
    <figure className="skills-chart">
      <ul className="legend" aria-label="Colours">
        {usedUses.map((use) => (
          <li key={use}>
            <span className="legend-swatch" style={{ background: colors[use] }} aria-hidden="true" />
            {SKILL_USE_LABELS[use]}
          </li>
        ))}
      </ul>
      <ul aria-label="Skills, with when and how each was used">
        {skills.map((skill, i) => (
          <li key={i} className="skill-row">
            <span className="skill-name">{skill.name}</span>
            <span className="skill-track">
              {axisYears(range).map((year) => (
                <span key={year} className="skill-gridline" style={{ left: at(year * 12) }} aria-hidden="true" />
              ))}
              <span className="skill-now" style={{ left: at(nowMonth + 1) }} aria-hidden="true" />
              {skill.periods.map((period, p) => (
                <SkillBar key={p} skill={skill.name} period={period} colors={colors} now={now} left={at(monthIndex(period.start))} right={at(monthIndex(period.end ?? currentMonth(now)) + 1)} />
              ))}
            </span>
            <span className="skill-value">{skill.periods.length > 0 && formatExperience(monthsUsed(skill, now))}</span>
          </li>
        ))}
      </ul>
      <div className="skill-axis" aria-hidden="true">
        <span />
        <span className="skill-axis-ticks">
          {axisYears(range).map((year) => (
            <span key={year} style={{ left: at(year * 12) }}>
              {year}
            </span>
          ))}
        </span>
        <span />
      </div>
    </figure>
  )
}

function SkillBar({ skill, period, colors, now, left, right }: { skill: string; period: SkillPeriod; colors: AboutColors['skills']; now: Date; left: string; right: string }) {
  const uses = period.uses.map((use) => SKILL_USE_LABELS[use]).join(', ')
  const when = formatPeriod(period.start, period.end, now)
  return (
    <span className="skill-bar" style={{ left, width: `calc(${right} - ${left})`, background: splitBackground(period.uses.map((u) => colors[u]), 'bands') }} tabIndex={0}>
      <span className="skill-tooltip" role="tooltip">
        <strong>{skill}</strong> {uses}
        <br />
        {when}
      </span>
      <span className="visually-hidden">
        : {uses}, {when}
      </span>
    </span>
  )
}

function SkillsEditor({ value, onChange, errors }: EditorProps<SkillsValue>) {
  const setSkills = (skills: Skill[]) => onChange({ ...value, skills })
  const newSkill = (): Skill => ({ name: '', periods: [{ start: currentMonth(), end: null, uses: ['work'] }] })

  return (
    <div className="editor-list">
      <fieldset className="editor-item">
        <legend>Colours</legend>
        <div className="color-row">
          {SKILL_USES.map((use) => (
            <ColorField
              key={use}
              label={SKILL_USE_LABELS[use]}
              value={value.colors[use]}
              onChange={(color) => onChange({ ...value, colors: { ...value.colors, [use]: color } })}
              error={errors[`colors.skills.${use}`]}
            />
          ))}
        </div>
      </fieldset>
      {value.skills.map((skill, i) => (
        <SkillEditor
          key={i}
          index={i}
          count={value.skills.length}
          skill={skill}
          colors={value.colors}
          errors={errors}
          onChange={(next) => setSkills(replaceAt(value.skills, i, next))}
          onMove={(from, to) => setSkills(move(value.skills, from, to))}
          onRemove={() => setSkills(removeAt(value.skills, i))}
        />
      ))}
      {errors.skills && <p className="field-error">{errors.skills}</p>}
      <AddButton onClick={() => setSkills([...value.skills, newSkill()])}>Add skill</AddButton>
    </div>
  )
}

interface SkillEditorProps {
  index: number
  count: number
  skill: Skill
  colors: AboutColors['skills']
  errors: FieldErrors
  onChange: (skill: Skill) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}

function SkillEditor({ index, count, skill, colors, errors, onChange, onMove, onRemove }: SkillEditorProps) {
  const key = `skills[${index}]`
  const setPeriods = (periods: SkillPeriod[]) => onChange({ ...skill, periods })
  const lastEnd = skill.periods.at(-1)?.end

  return (
    <fieldset className="editor-item">
      <legend>Skill {index + 1}</legend>
      <div className="editor-item-toolbar">
        <ItemControls name={`skill ${index + 1}`} index={index} count={count} onMove={onMove} onRemove={onRemove} />
      </div>
      <TextField label="Skill" value={skill.name} required onChange={(name) => onChange({ ...skill, name })} error={errors[`${key}.name`]} />
      <div className="editor-subitems">
        {skill.periods.length === 0 && <p className="muted editor-note">No dates yet. Add when you used it to show it on the timeline.</p>}
        {skill.periods.map((period, p) => (
          <PeriodEditor
            key={p}
            name={`period ${p + 1} of skill ${index + 1}`}
            label={`Period ${p + 1}`}
            period={period}
            colors={colors}
            errorKey={`${key}.periods[${p}]`}
            errors={errors}
            onChange={(next) => setPeriods(replaceAt(skill.periods, p, next))}
            onRemove={() => setPeriods(removeAt(skill.periods, p))}
          />
        ))}
        {errors[`${key}.periods`] && <p className="field-error">{errors[`${key}.periods`]}</p>}
        <AddButton onClick={() => setPeriods([...skill.periods, { start: lastEnd ?? currentMonth(), end: null, uses: ['work'] }])}>
          Add period <span className="visually-hidden">to skill {index + 1}</span>
        </AddButton>
      </div>
    </fieldset>
  )
}

interface PeriodEditorProps {
  name: string
  label: string
  period: SkillPeriod
  colors: AboutColors['skills']
  errorKey: string
  errors: FieldErrors
  onChange: (period: SkillPeriod) => void
  onRemove: () => void
}

function PeriodEditor({ name, label, period, colors, errorKey, errors, onChange, onRemove }: PeriodEditorProps) {
  const ongoingId = useId()
  const set = (patch: Partial<SkillPeriod>) => onChange({ ...period, ...patch })

  return (
    <div className="editor-subitem" role="group" aria-label={label}>
      <div className="editor-period">
        <MonthField label="From" value={period.start} onChange={(start) => set({ start })} error={errors[`${errorKey}.start`]} />
        {period.end !== null && <MonthField label="To" value={period.end} onChange={(end) => set({ end })} error={errors[`${errorKey}.end`]} />}
        <div className="checkbox-field">
          <input id={ongoingId} type="checkbox" checked={period.end === null} onChange={(e) => set({ end: e.target.checked ? null : period.start })} />
          <label htmlFor={ongoingId}>Still using it</label>
        </div>
        <ItemControls name={name} index={0} count={1} onRemove={onRemove} />
      </div>
      <CheckboxGroup
        label="Used for"
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
