import { useId } from 'react'

export interface CheckboxGroupProps<T extends string> {
  label: string
  options: readonly T[]
  value: readonly T[]
  onChange: (value: T[]) => void
  labelFor: (option: T) => string
  colorFor?: (option: T) => string
  error?: string
}

/**
 * A row of checkboxes for picking some of a fixed set, e.g. what a skill was used for. Ticking keeps the
 * options' own order, whatever order they're ticked in.
 */
export function CheckboxGroup<T extends string>({ label, options, value, onChange, labelFor, colorFor, error }: CheckboxGroupProps<T>) {
  const id = useId()
  const errorId = error ? `${id}-error` : undefined

  return (
    <fieldset className="checkbox-group" aria-describedby={errorId}>
      <legend className="field-label">{label}</legend>
      <div className="checkbox-group-options">
        {options.map((option) => {
          const color = colorFor?.(option)
          return (
            <label key={option} className="checkbox-field">
              <input type="checkbox" checked={value.includes(option)} onChange={(e) => onChange(options.filter((o) => (o === option ? e.target.checked : value.includes(o))))} />
              {color && <span className="legend-swatch" style={{ background: color }} aria-hidden="true" />}
              {labelFor(option)}
            </label>
          )
        })}
      </div>
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </fieldset>
  )
}
