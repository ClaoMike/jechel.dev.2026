import { useId } from 'react'

export interface ColorFieldProps {
  label: string
  /** "#rrggbb". */
  value: string
  onChange: (value: string) => void
  error?: string
}

/** A colour swatch that opens the browser's colour picker. The value is "#rrggbb". */
export function ColorField({ label, value, onChange, error }: ColorFieldProps) {
  const id = useId()
  const errorId = error ? `${id}-error` : undefined
  return (
    <div className="color-field">
      <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={errorId} />
      <label htmlFor={id}>{label}</label>
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  )
}
