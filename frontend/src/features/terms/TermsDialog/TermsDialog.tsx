import { useEffect, useId, useRef } from 'react'
import { useLocation } from 'react-router'
import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { Modal } from '../../../components/Modal/Modal'
import { TermsSkeleton } from '../TermsSkeleton/TermsSkeleton'
import { TermsDocumentView } from '../TermsDocumentView/TermsDocumentView'
import { useAppDispatch } from '../../../store'
import { termsClosed } from '../../../store/termsSlice'
import { useTerms } from '../useTerms'

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
        <h2 id={titleId}>{state.status === 'loaded' ? state.data.title : 'Terms and Conditions'}</h2>
        <button ref={closeRef} type="button" className="icon-button" onClick={close} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {state.status === 'loading' && <TermsSkeleton />}
      {state.status === 'error' && <ErrorState message="The terms couldn't be loaded." onRetry={reload} />}
      {state.status === 'loaded' && <TermsDocumentView terms={state.data} hideTitle />}
    </Modal>
  )
}
