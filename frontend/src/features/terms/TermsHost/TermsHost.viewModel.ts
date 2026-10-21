import { useAppSelector } from '../../../store'
import { useLoadTerms, useTerms } from '../useTerms'

/** Whether the welcome popup and the terms popup are up. */
export function useTermsHostViewModel() {
  useLoadTerms()
  const { mustAccept } = useTerms()
  const dialogOpen = useAppSelector((state) => state.terms.dialogOpen)
  return { mustAccept, dialogOpen }
}
