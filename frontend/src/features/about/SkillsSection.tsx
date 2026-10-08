import type { Skill } from '../../services/api'
import { EditableSection } from './EditableSection'
import { AddButton, ItemControls, TextField, type EditorProps } from './fields'
import { skillLevelName } from './format'
import { move, removeAt, replaceAt } from './list'

const GRIDLINES = [25, 50, 75]
const TICKS = [0, 25, 50, 75, 100]

export function SkillsSection({ value, canEdit, onSave }: { value: Skill[]; canEdit: boolean; onSave: (value: Skill[]) => Promise<void> }) {
  return (
    <EditableSection title="Skills" value={value} canEdit={canEdit} onSave={onSave} editor={SkillsEditor}>
      {value.length === 0 ? <p className="muted">No skills yet.</p> : <SkillsChart skills={value} />}
    </EditableSection>
  )
}

/**
 * Horizontal bars, 0–100, in the order the admin chose. Each bar is labelled with its name and
 * value, so the list itself is the accessible version of the chart; hovering a bar adds a tooltip.
 */
export function SkillsChart({ skills }: { skills: Skill[] }) {
  return (
    <figure className="skills-chart">
      <ul aria-label="Skills, with proficiency out of 100">
        {skills.map((skill, i) => (
          <li key={i} className="skill-row">
            <span className="skill-name">{skill.name}</span>
            <span className="skill-track" aria-hidden="true">
              {GRIDLINES.map((at) => (
                <span key={at} className="skill-gridline" style={{ left: `${at}%` }} />
              ))}
              <span className="skill-bar" style={{ width: `${Math.min(100, Math.max(0, skill.level))}%` }} />
              <span className="skill-tooltip">
                <strong>{skill.name}</strong> {skill.level} / 100 · {skillLevelName(skill.level)}
              </span>
            </span>
            <span className="skill-value">
              {skill.level}
              <span className="visually-hidden"> out of 100</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="skill-axis" aria-hidden="true">
        <span />
        <span className="skill-axis-ticks">
          {TICKS.map((at) => (
            <span key={at} style={{ left: `${at}%` }}>
              {at}
            </span>
          ))}
        </span>
        <span />
      </div>
    </figure>
  )
}

function SkillsEditor({ value, onChange, errors }: EditorProps<Skill[]>) {
  return (
    <div className="editor-list">
      {value.map((skill, i) => (
        <fieldset key={i} className="editor-item editor-item-inline">
          <legend className="visually-hidden">Skill {i + 1}</legend>
          <TextField label="Skill" value={skill.name} required onChange={(name) => onChange(replaceAt(value, i, { ...skill, name }))} error={errors[`skills[${i}].name`]} />
          <TextField
            label="Level (0–100)"
            type="number"
            min={0}
            max={100}
            value={String(skill.level)}
            onChange={(level) => onChange(replaceAt(value, i, { ...skill, level: Number(level) }))}
            error={errors[`skills[${i}].level`]}
          />
          <ItemControls name={`skill ${i + 1}`} index={i} count={value.length} onMove={(from, to) => onChange(move(value, from, to))} onRemove={() => onChange(removeAt(value, i))} />
        </fieldset>
      ))}
      {errors.skills && <p className="field-error">{errors.skills}</p>}
      <AddButton onClick={() => onChange([...value, { name: '', level: 50 }])}>Add skill</AddButton>
    </div>
  )
}
