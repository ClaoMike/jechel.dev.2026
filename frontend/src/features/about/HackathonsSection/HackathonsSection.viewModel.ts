import { useId, useState } from 'react'
import type { Hackathon } from '../../../services/api'

const YEAR = /^\d{4}$/

/** The year box keeps what's typed ("20" on the way to "2024"); the value changes once it's a full year. */
export function useHackathonYearViewModel(hackathon: Hackathon, onChange: (hackathon: Hackathon) => void) {
  const [year, setYear] = useState(String(hackathon.year))
  const [shownYear, setShownYear] = useState(hackathon.year)
  if (hackathon.year !== shownYear) {
    setShownYear(hackathon.year)
    setYear(String(hackathon.year))
  }

  return {
    yearId: useId(),
    year,
    yearValid: YEAR.test(year),
    setYear: (next: string) => {
      setYear(next)
      if (YEAR.test(next)) onChange({ ...hackathon, year: Number(next) })
    },
  }
}
