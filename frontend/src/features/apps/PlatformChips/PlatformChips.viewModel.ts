import { useId } from 'react'

/** The list's label id, so the list is named "Runs on". */
export function usePlatformChipsViewModel() {
  return { labelId: `${useId()}-platforms` }
}
