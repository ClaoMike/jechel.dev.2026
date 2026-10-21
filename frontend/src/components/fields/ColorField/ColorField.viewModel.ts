import { useId } from 'react'

export interface ColorFieldProps {
  label: string
  /** "#rrggbb". */
  value: string
  onChange: (value: string) => void
  error?: string
}

export function useColorFieldViewModel({ onChange, error }: ColorFieldProps) {
  const id = useId()
  return {
    id,
    errorId: error ? `${id}-error` : undefined,
    change: (e: { target: { value: string } }) => onChange(e.target.value),
  }
}
