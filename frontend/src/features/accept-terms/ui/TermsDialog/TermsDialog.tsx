import { useEffect, useId, useRef } from 'react'
import { useLocation } from 'react-router'
import { ErrorState } from '@/shared/ui/ErrorState'
import { Modal } from '@/shared/ui/Modal'
import { TermsSkeleton } from '@/entities/terms-of-use'
import { TermsDocumentView } from '@/entities/terms-of-use'
import { useAppDispatch } from '@/shared/lib/store'
import { termsClosed } from '@/entities/terms-of-use'
import { useTerms } from '@/entities/terms-of-use'
import { strings } from '@/shared/i18n'

/** The terms in a popup, closed with × (or Escape, or a click outside). It sits above every other popup, the welcome one included. */
export function TermsDialog() {
  const dispatch = useAppDispatch()
  const { state, reload } = useTerms()
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const close = () => dispatch(termsClosed())

  // A link in the terms to a page of the site (e.g. Contact) goes there: the popup makes way.
  const { pathname } = useLocation()
  const openedOn = useRef(pathname)
  useEffect(() => {
    if (pathname !== openedOn.current) dispatch(termsClosed())
  }, [pathname, dispatch])

  return (
    <Modal labelledBy={titleId} initialFocus={closeRef} onClose={close} className="modal-wide terms-modal">
      <div className="modal-header">
        <h2 id={titleId}>{state.status === 'loaded' ? state.data.title : strings.common.termsConditions}</h2>
        <button ref={closeRef} type="button" className="icon-button" onClick={close} aria-label={strings.common.close}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {state.status === 'loading' && <TermsSkeleton />}
      {state.status === 'error' && <ErrorState message={strings.termsDialog.termsCouldntLoaded} onRetry={reload} />}
      {state.status === 'loaded' && <TermsDocumentView terms={state.data} hideTitle />}
    </Modal>
  )
}
