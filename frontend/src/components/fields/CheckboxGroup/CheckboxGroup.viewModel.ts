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

/** Each option ticked or not; ticking keeps the options' own order, whatever order they're ticked in. */
export function useCheckboxGroupViewModel<T extends string>({ options, value, onChange, labelFor, colorFor, error }: CheckboxGroupProps<T>) {
  const id = useId()
  return {
    errorId: error ? `${id}-error` : undefined,
    options: options.map((option) => ({
      key: option,
      label: labelFor(option),
      color: colorFor?.(option),
      checked: value.includes(option),
      toggle: (checked: boolean) => onChange(options.filter((o) => (o === option ? checked : value.includes(o)))),
    })),
  }
}
