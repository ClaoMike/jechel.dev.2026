import { useId, useState, type ReactNode } from 'react'
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from '../../components/icons'

/** API field errors, first message per path, e.g. { "experience[0].title": "Required." }. */
export type FieldErrors = Record<string, string>

export interface EditorProps<T> {
  value: T
  onChange: (value: T) => void
  errors: FieldErrors
}

interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  multiline?: boolean
  type?: 'text' | 'url' | 'number'
  required?: boolean
  placeholder?: string
  min?: number
  max?: number
}

export function TextField({ label, value, onChange, error, hint, multiline = false, type = 'text', required, placeholder, min, max }: TextFieldProps) {
  const id = useId()
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
  const common = {
    id,
    value,
    required,
    placeholder,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea {...common} rows={3} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...common} type={type} min={min} max={max} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, i, 1))),
)

/**
 * A month: a month picker plus a year box (desktop Safari and Firefox have no <input type="month">).
 * The value is the first of the month, "YYYY-MM-01".
 */
export function MonthField({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string }) {
  const id = useId()
  // The year box keeps what's typed (e.g. "20" on the way to "2024"), and resyncs when the value
  // changes from outside, e.g. when an item above is removed and this field shows another item.
  const [year, setYear] = useState(value.slice(0, 4))
  const [shownValue, setShownValue] = useState(value)
  if (value !== shownValue) {
    setShownValue(value)
    setYear(value.slice(0, 4))
  }
  const month = Number(value.slice(5, 7)) || 1

  const emit = (nextYear: string, nextMonth: number) => {
    if (/^\d{4}$/.test(nextYear)) onChange(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01`)
  }

  return (
    <div className="field" role="group" aria-labelledby={`${id}-label`} aria-describedby={error ? `${id}-error` : undefined}>
      <span className="field-label" id={`${id}-label`}>
        {label}
      </span>
      <div className="month-field">
        <select aria-label={`${label} month`} value={month} onChange={(e) => emit(year, Number(e.target.value))}>
          {MONTHS.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <input
          aria-label={`${label} year`}
          inputMode="numeric"
          maxLength={4}
          value={year}
          aria-invalid={error || !/^\d{4}$/.test(year) ? true : undefined}
          onChange={(e) => {
            setYear(e.target.value)
            emit(e.target.value, month)
          }}
        />
      </div>
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

/** Move up / move down / remove buttons for one item of an editable list. */
export function ItemControls({ name, index, count, onMove, onRemove }: { name: string; index: number; count: number; onMove?: (from: number, to: number) => void; onRemove: () => void }) {
  return (
    <div className="item-controls">
      {onMove && (
        <>
          <button type="button" className="icon-button" aria-label={`Move ${name} up`} title="Move up" disabled={index === 0} onClick={() => onMove(index, index - 1)}>
            <ArrowUpIcon />
          </button>
          <button type="button" className="icon-button" aria-label={`Move ${name} down`} title="Move down" disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
            <ArrowDownIcon />
          </button>
        </>
      )}
      <button type="button" className="icon-button icon-button-danger" aria-label={`Remove ${name}`} title="Remove" onClick={onRemove}>
        <TrashIcon />
      </button>
    </div>
  )
}

export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="button button-secondary button-small add-button" onClick={onClick}>
      <PlusIcon size={16} />
      {children}
    </button>
  )
}
