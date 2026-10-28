import { useId, useState } from 'react'
import { strings } from '../../../strings'

export interface MonthFieldProps {
  label: string
  /** The first of the month, "YYYY-MM-01". */
  value: string
  onChange: (value: string) => void
  error?: string
}

/** January to December, in the visitor's language. */
const MONTHS = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, i, 1))))

const YEAR = /^\d{4}$/

/**
 * A month: a month picker plus a year box (desktop Safari and Firefox have no <input type="month">), typed separately.
 * The value is the first of the month, "YYYY-MM-01".
 */
export function MonthField({ label, value, onChange, error }: MonthFieldProps) {
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
  const labelId = `${id}-label`
  const errorId = error ? `${id}-error` : undefined

  const emit = (nextYear: string, nextMonth: number) => {
    if (YEAR.test(nextYear)) onChange(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01`)
  }

  return (
    <div className="field" role="group" aria-labelledby={labelId} aria-describedby={errorId}>
      <span className="field-label" id={labelId}>
        {label}
      </span>
      <div className="month-field">
        <select aria-label={strings.monthField.month(label)} value={month} onChange={(e) => emit(year, Number(e.target.value))}>
          {MONTHS.map((name, i) => (
            <option key={i + 1} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <input
          aria-label={strings.monthField.year(label)}
          inputMode="numeric"
          maxLength={4}
          value={year}
          aria-invalid={!!error || !YEAR.test(year) || undefined}
          onChange={(e) => {
            setYear(e.target.value)
            emit(e.target.value, month)
          }}
        />
      </div>
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  )
}
