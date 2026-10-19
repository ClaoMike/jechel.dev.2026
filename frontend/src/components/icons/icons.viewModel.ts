import { useId } from 'react'

/** The gradient's id: unique per icon on the page. */
export function useInstagramIconViewModel() {
  return { gradient: useId() }
}
