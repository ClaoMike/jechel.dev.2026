import { TermsDialog } from '../TermsDialog/TermsDialog'
import { TermsGate } from '../TermsGate/TermsGate'
import { useAppSelector } from '../../../store'
import { useLoadTerms, useTerms } from '../useTerms'

/**
 * The terms' popups, for the whole site: visitors are asked to accept the terms before using it (the
 * signed-in admin isn't), and the terms open in a popup on request (openTerms, from useTerms).
 */
export function TermsHost() {
  useLoadTerms()
  const { mustAccept } = useTerms()
  const dialogOpen = useAppSelector((state) => state.terms.dialogOpen)
  return (
    <>
      {mustAccept && <TermsGate />}
      {dialogOpen && <TermsDialog />}
    </>
  )
}
