import { useState } from 'react'
import { AddButton, type EditorProps } from '../../../../components/fields'
import { SKILL_USES, type Skill } from '../../../../services/api'
import { currentMonth } from '../../format'
import { SKILL_USE_LABELS } from '../../legend'
import { move, removeAt, replaceAt } from '../../list'
import { ColorsFieldset } from '../../section/ColorsFieldset/ColorsFieldset'
import { SortableListHeader } from '../../section/SortableListHeader/SortableListHeader'
import { SkillEditor } from '../SkillEditor/SkillEditor'
import { sortByExperience, type SkillsValue } from '../skills'

function swapped(open: ReadonlySet<number>, from: number, to: number): ReadonlySet<number> {
  return new Set([...open].map((n) => (n === from ? to : n === to ? from : n)))
}

const newSkill = (): Skill => ({ name: '', periods: [{ start: currentMonth(), end: null, uses: ['work'] }] })

/**
 * The colour of each use, then every skill (folded until clicked open), reorderable and sortable. Which skills are open
 * goes by position, kept in step when skills move, go or come.
 */
export function SkillsEditor({ value, onChange, errors }: EditorProps<SkillsValue>) {
  const [sorted, setSorted] = useState(false)
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  const skills = value.skills
  const setSkills = (next: Skill[], nextOpen = open) => {
    setSorted(false)
    setOpen(nextOpen)
    onChange({ ...value, skills: next })
  }

  return (
    <div className="editor-list">
      <SortableListHeader
        sortLabel="Sort by experience"
        sortedMessage="Sorted by experience, most first. Save to keep this order, or Cancel to undo."
        canSort={skills.length >= 2}
        sorted={sorted}
        sort={() => {
          onChange({ ...value, skills: sortByExperience(skills) })
          setOpen(new Set())
          setSorted(true)
        }}
      />
      <ColorsFieldset
        colors={SKILL_USES.map((use) => ({
          key: use,
          label: SKILL_USE_LABELS[use],
          value: value.colors[use],
          onChange: (color: string) => onChange({ ...value, colors: { ...value.colors, [use]: color } }),
          error: errors[`colors.skills.${use}`],
        }))}
      />
      {skills.map((skill, i) => (
        <SkillEditor
          key={i}
          index={i}
          count={skills.length}
          skill={skill}
          colors={value.colors}
          errors={errors}
          open={open.has(i)}
          onToggle={() => setOpen((current) => (current.has(i) ? new Set([...current].filter((n) => n !== i)) : new Set([...current, i])))}
          onChange={(next) => setSkills(replaceAt(skills, i, next))}
          onMove={(from, to) => setSkills(move(skills, from, to), swapped(open, from, to))}
          onRemove={() => setSkills(removeAt(skills, i), new Set([...open].filter((n) => n !== i).map((n) => (n > i ? n - 1 : n))))}
        />
      ))}
      {errors.skills && <p className="field-error">{errors.skills}</p>}
      <AddButton onClick={() => setSkills([...skills, newSkill()], new Set([...open, skills.length]))}>Add skill</AddButton>
    </div>
  )
}
