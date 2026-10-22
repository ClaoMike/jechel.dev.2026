import { useId } from 'react'

/** The gradient's id: unique per icon on the page. */
export function useInstagramIconViewModel() {
  return { gradient: useId() }
}

/** The id of the cup's inside (what the coffee fills): unique per icon on the page. */
export function useCoffeeIconViewModel() {
  return { inside: useId() }
}
