import { useId } from 'react'

export function useAppDetailsViewViewModel() {
  return { id: useId() }
}
