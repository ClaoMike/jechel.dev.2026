import { useId } from 'react'

export function useErrorStateViewModel() {
  return { id: useId() }
}
