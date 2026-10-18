import { useId, useState } from 'react'
import { ArrowDownIcon, SortIcon } from '../../components/icons'
import { SKILL_USES, type AboutColors, type Skill, type SkillPeriod } from '../../services/api'
import { EditableSection } from './EditableSection'
import { AddButton, CheckboxGroup, ColorField, ItemControls, MonthField, TextField, type EditorProps, type FieldErrors } from './fields'
import { currentMonth, formatPeriod } from './format'
import { SKILL_USE_LABELS, splitBackground } from './legend'
import { move, removeAt, replaceAt } from './list'
import { axisYears, chartRange, formatExperience, monthIndex, monthsUsed, sortByExperience } from './skills'
import { plainText } from './textLinks'

export interface SkillsValue {
  skills: Skill[]
  colors: AboutColors['skills']
}

export function SkillsSection({ value, canEdit, onSave }: { value: SkillsValue; canEdit: boolean; onSave: (value: SkillsValue) => Promise<void> }) {
  return (
    <EditableSection title="Skills" errorKeys={['skills', 'colors.skills']} value={value} canEdit={canEdit} onSave={onSave} editor={(props) => <SkillsEditor {...props} />}>
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
  const [sorted, setSorted] = useState(false)
  // Which skills are open, by position: kept in step when skills move, go or come.
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  const setSkills = (skills: Skill[], nextOpen = open) => {
    setSorted(false)
    setOpen(nextOpen)
    onChange({ ...value, skills })
  }
  const toggle = (i: number) => setOpen((current) => (current.has(i) ? new Set([...current].filter((n) => n !== i)) : new Set([...current, i])))
  const newSkill = (): Skill => ({ name: '', periods: [{ start: currentMonth(), end: null, uses: ['work'] }] })

  return (
    <div className="editor-list">
      <div className="editor-list-header">
        <p className="muted editor-note">Shown in this order. Move skills with the arrows, or sort them by experience. Click a skill to edit it.</p>
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={value.skills.length < 2}
          onClick={() => {
            onChange({ ...value, skills: sortByExperience(value.skills) })
            setOpen(new Set())
            setSorted(true)
          }}
        >
          <SortIcon size={16} />
          Sort by experience
        </button>
      </div>
      <p role="status" className={sorted ? 'editor-status' : 'visually-hidden'}>
        {sorted ? 'Sorted by experience, most first. Save to keep this order, or Cancel to undo.' : ''}
      </p>
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
          open={open.has(i)}
          onToggle={() => toggle(i)}
          onChange={(next) => setSkills(replaceAt(value.skills, i, next))}
          onMove={(from, to) => setSkills(move(value.skills, from, to), swapped(open, from, to))}
          onRemove={() => setSkills(removeAt(value.skills, i), new Set([...open].filter((n) => n !== i).map((n) => (n > i ? n - 1 : n))))}
        />
      ))}
      {errors.skills && <p className="field-error">{errors.skills}</p>}
      <AddButton onClick={() => setSkills([...value.skills, newSkill()], new Set([...open, value.skills.length]))}>Add skill</AddButton>
    </div>
  )
}

/** The open positions after the skills at `from` and `to` swap places. */
function swapped(open: ReadonlySet<number>, from: number, to: number): ReadonlySet<number> {
  return new Set([...open].map((n) => (n === from ? to : n === to ? from : n)))
}

interface SkillEditorProps {
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
function SkillEditor({ index, count, skill, colors, errors, open, onToggle, onChange, onMove, onRemove }: SkillEditorProps) {
  const bodyId = useId()
  const key = `skills[${index}]`
  const setPeriods = (periods: SkillPeriod[]) => onChange({ ...skill, periods })
  const lastEnd = skill.periods.at(-1)?.end
  const hasError = Object.keys(errors).some((k) => k.startsWith(`${key}.`) || k === key)
  const expanded = open || hasError
  const name = plainText(skill.name).trim()
  const months = monthsUsed(skill)

  return (
    <fieldset className="editor-item accordion-item">
      <legend className="visually-hidden">Skill {index + 1}</legend>
      <div className="accordion-header">
        <button type="button" className="accordion-toggle" aria-expanded={expanded} aria-controls={bodyId} onClick={onToggle} disabled={hasError}>
          <ArrowDownIcon size={16} />
          <span className="accordion-title">{name || `Skill ${index + 1}`}</span>
          <span className="muted accordion-meta">
            {skill.periods.length === 0 ? 'no dates' : months > 0 ? formatExperience(months) : `${skill.periods.length} ${skill.periods.length === 1 ? 'period' : 'periods'}`}
          </span>
        </button>
        <ItemControls name={`skill ${index + 1}`} index={index} count={count} onMove={onMove} onRemove={onRemove} />
      </div>
      <div id={bodyId} className="accordion-body" hidden={!expanded}>
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
