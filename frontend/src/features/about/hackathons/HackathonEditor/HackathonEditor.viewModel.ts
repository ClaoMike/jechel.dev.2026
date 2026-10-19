import { useId, useState } from 'react'
import type { FieldErrors } from '../../../../components/fields'
import type { Hackathon } from '../../../../services/api'

const YEAR = /^\d{4}$/

export interface HackathonEditorProps {
  index: number
  count: number
  hackathon: Hackathon
  errors: FieldErrors
  onChange: (hackathon: Hackathon) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}

/** One hackathon's name, year and bullets. The year box keeps what's typed ("20" on the way to "2024"); the value changes once it's a full year. */
export function useHackathonEditorViewModel({ index, hackathon, errors, onChange }: HackathonEditorProps) {
  const [year, setYear] = useState(String(hackathon.year))
  const [shownYear, setShownYear] = useState(hackathon.year)
  if (hackathon.year !== shownYear) {
    setShownYear(hackathon.year)
    setYear(String(hackathon.year))
  }
  const key = `hackathons[${index}]`
  const yearError = errors[`${key}.year`]
  const yearId = useId()

  return {
    legend: `Hackathon ${index + 1}`,
    name: `hackathon ${index + 1}`,
    yearId,
    yearErrorId: yearError ? `${yearId}-error` : undefined,
    year,
    yearInvalid: !!yearError || !YEAR.test(year),
    yearError,
    nameError: errors[`${key}.name`],
    bulletError: (b: number) => errors[`${key}.bullets[${b}]`],
    bulletsError: errors[`${key}.bullets`],
    setName: (name: string) => onChange({ ...hackathon, name }),
    setYear: (next: string) => {
      setYear(next)
      if (YEAR.test(next)) onChange({ ...hackathon, year: Number(next) })
    },
    setBullets: (bullets: string[]) => onChange({ ...hackathon, bullets }),
  }
}
