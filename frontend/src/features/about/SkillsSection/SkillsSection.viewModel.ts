import { useState } from 'react'
import type { Skill } from '../../../services/api'
import { currentMonth } from '../format'
import { move, removeAt, replaceAt } from '../list'
import { sortByExperience } from '../skills'

/** "Now" for the chart, fixed when it first shows (or given, e.g. for a stable picture). */
export function useSkillsChartViewModel(fixedNow?: Date) {
  const [now] = useState(() => fixedNow ?? new Date())
  return { now }
}

function swapped(open: ReadonlySet<number>, from: number, to: number): ReadonlySet<number> {
  return new Set([...open].map((n) => (n === from ? to : n === to ? from : n)))
}

const newSkill = (): Skill => ({ name: '', periods: [{ start: currentMonth(), end: null, uses: ['work'] }] })

/** The skills being edited, which are open (by position: kept in step when skills move, go or come), and sorting them. */
export function useSkillsEditorViewModel(skills: Skill[], onChange: (skills: Skill[]) => void) {
  const [sorted, setSorted] = useState(false)
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  const setSkills = (next: Skill[], nextOpen = open) => {
    setSorted(false)
    setOpen(nextOpen)
    onChange(next)
  }

  return {
    sorted,
    canSort: skills.length >= 2,
    sort: () => {
      onChange(sortByExperience(skills))
      setOpen(new Set())
      setSorted(true)
    },
    isOpen: (i: number) => open.has(i),
    toggle: (i: number) => setOpen((current) => (current.has(i) ? new Set([...current].filter((n) => n !== i)) : new Set([...current, i]))),
    change: (i: number, skill: Skill) => setSkills(replaceAt(skills, i, skill)),
    move: (from: number, to: number) => setSkills(move(skills, from, to), swapped(open, from, to)),
    remove: (i: number) => setSkills(removeAt(skills, i), new Set([...open].filter((n) => n !== i).map((n) => (n > i ? n - 1 : n)))),
    add: () => setSkills([...skills, newSkill()], new Set([...open, skills.length])),
  }
}
