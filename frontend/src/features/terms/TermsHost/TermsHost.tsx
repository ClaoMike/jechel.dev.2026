import { TermsDialog } from '../TermsDialog/TermsDialog'
import { TermsGate } from '../TermsGate/TermsGate'
import { useTermsHostViewModel } from './TermsHost.viewModel'

/**
 * The terms' popups, for the whole site: visitors are asked to accept the terms before using it (the
 * signed-in admin isn't), and the terms open in a popup on request (openTerms, from useTerms).
 */
export function TermsHost() {
  const vm = useTermsHostViewModel()
  return (
    <>
      {vm.mustAccept && <TermsGate />}
      {vm.dialogOpen && <TermsDialog />}
    </>
  )
}
