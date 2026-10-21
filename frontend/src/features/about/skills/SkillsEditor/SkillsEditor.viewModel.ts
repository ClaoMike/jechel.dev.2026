import { useState } from 'react'
import type { EditorProps } from '../../../../components/fields'
import { SKILL_USES, type Skill } from '../../../../services/api'
import { currentMonth } from '../../format'
import { SKILL_USE_LABELS } from '../../legend'
import { move, removeAt, replaceAt } from '../../list'
import { sortByExperience, type SkillsValue } from '../skills'

function swapped(open: ReadonlySet<number>, from: number, to: number): ReadonlySet<number> {
  return new Set([...open].map((n) => (n === from ? to : n === to ? from : n)))
}

const newSkill = (): Skill => ({ name: '', periods: [{ start: currentMonth(), end: null, uses: ['work'] }] })

/** The skills being edited, which are open (by position: kept in step when skills move, go or come), sorting them, and the colours. */
export function useSkillsEditorViewModel({ value, onChange, errors }: EditorProps<SkillsValue>) {
  const [sorted, setSorted] = useState(false)
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  const skills = value.skills
  const setSkills = (next: Skill[], nextOpen = open) => {
    setSorted(false)
    setOpen(nextOpen)
    onChange({ ...value, skills: next })
  }

  return {
    header: {
      note: 'Shown in this order. Move skills with the arrows, or sort them by experience. Click a skill to edit it.',
      sortLabel: 'Sort by experience',
      sortedMessage: 'Sorted by experience, most first. Save to keep this order, or Cancel to undo.',
      canSort: skills.length >= 2,
      sorted,
      sort: () => {
        onChange({ ...value, skills: sortByExperience(skills) })
        setOpen(new Set())
        setSorted(true)
      },
    },
    colors: SKILL_USES.map((use) => ({
      key: use,
      label: SKILL_USE_LABELS[use],
      value: value.colors[use],
      onChange: (color: string) => onChange({ ...value, colors: { ...value.colors, [use]: color } }),
      error: errors[`colors.skills.${use}`],
    })),
    skills: skills.map((skill, i) => ({
      key: i,
      index: i,
      count: skills.length,
      skill,
      colors: value.colors,
      errors,
      open: open.has(i),
      onToggle: () => setOpen((current) => (current.has(i) ? new Set([...current].filter((n) => n !== i)) : new Set([...current, i]))),
      onChange: (next: Skill) => setSkills(replaceAt(skills, i, next)),
      onMove: (from: number, to: number) => setSkills(move(skills, from, to), swapped(open, from, to)),
      onRemove: () => setSkills(removeAt(skills, i), new Set([...open].filter((n) => n !== i).map((n) => (n > i ? n - 1 : n)))),
    })),
    listError: errors.skills,
    add: () => setSkills([...skills, newSkill()], new Set([...open, skills.length])),
  }
}
