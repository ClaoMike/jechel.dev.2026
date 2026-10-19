import { useId, useState } from 'react'

export interface MonthFieldProps {
  label: string
  /** The first of the month, "YYYY-MM-01". */
  value: string
  onChange: (value: string) => void
  error?: string
}

/** January to December, in the visitor's language. */
export const MONTHS = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, i, 1))))

const YEAR = /^\d{4}$/

/** A month and a year typed separately; the value is the first of the month, "YYYY-MM-01". */
export function useMonthFieldViewModel({ label, value, onChange, error }: MonthFieldProps) {
  // The year box keeps what's typed (e.g. "20" on the way to "2024"), and resyncs when the value
  // changes from outside, e.g. when an item above is removed and this field shows another item.
  const [year, setYear] = useState(value.slice(0, 4))
  const [shownValue, setShownValue] = useState(value)
  if (value !== shownValue) {
    setShownValue(value)
    setYear(value.slice(0, 4))
  }
  const month = Number(value.slice(5, 7)) || 1
  const id = useId()

  const emit = (nextYear: string, nextMonth: number) => {
    if (YEAR.test(nextYear)) onChange(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01`)
  }

  return {
    labelId: `${id}-label`,
    errorId: error ? `${id}-error` : undefined,
    monthLabel: `${label} month`,
    yearLabel: `${label} year`,
    months: MONTHS.map((name, i) => ({ name, value: i + 1 })),
    year,
    month,
    yearInvalid: !!error || !YEAR.test(year),
    setMonth: (next: number) => emit(year, next),
    setYear: (next: string) => {
      setYear(next)
      emit(next, month)
    },
  }
}
