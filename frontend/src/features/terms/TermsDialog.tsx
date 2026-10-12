import { useId, useRef } from 'react'
import { Modal } from '../../components/Modal'
import type { TermsState } from './termsContext'
import { TermsDocumentView } from './TermsDocumentView'

/** The terms in a popup. It sits above every other popup, the welcome one included. */
export function TermsDialog({ state, onClose }: { state: TermsState; onClose: () => void }) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  return (
    <Modal labelledBy={titleId} initialFocus={closeRef} onClose={onClose} className="modal-wide terms-modal">
      <header className="modal-header">
        <h2 id={titleId}>{state.status === 'loaded' ? state.terms.title : 'Terms and Conditions'}</h2>
        <button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
      </header>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <p role="alert">The terms couldn't be loaded. Please try again later.</p>}
      {state.status === 'loaded' && <TermsDocumentView terms={state.terms} hideTitle />}
      <div className="terms-modal-actions">
        <button type="button" className="button" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}
