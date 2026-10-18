import { useId, useRef } from 'react'
import { ErrorState } from '../../components/ErrorState'
import { Modal } from '../../components/Modal'
import { Loading, SkeletonText } from '../../components/Skeleton'
import type { TermsState } from './termsContext'
import { TermsDocumentView } from './TermsDocumentView'

/** The terms in a popup. It sits above every other popup, the welcome one included. */
export function TermsDialog({ state, onRetry, onClose }: { state: TermsState; onRetry: () => void; onClose: () => void }) {
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
      {state.status === 'loading' && <TermsSkeleton />}
      {state.status === 'error' && <ErrorState message="The terms couldn't be loaded." onRetry={onRetry} />}
      {state.status === 'loaded' && <TermsDocumentView terms={state.terms} hideTitle />}
      <div className="terms-modal-actions">
        <button type="button" className="button" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}

/** The terms' shape while they load: an introduction, then numbered sections of paragraphs. */
export function TermsSkeleton() {
  return (
    <Loading label="Loading the terms…">
      <SkeletonText lines={2} />
      {[4, 3, 5].map((lines, i) => (
        <div key={i} className="skeleton-text">
          <SkeletonText lines={1} lineHeight={20} />
          <SkeletonText lines={lines} />
        </div>
      ))}
    </Loading>
  )
}
