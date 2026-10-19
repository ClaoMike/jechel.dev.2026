import { PencilIcon } from '../../components/icons/icons'
import { ErrorState } from '../../components/ErrorState/ErrorState'
import { TermsDocumentView } from '../../features/terms/TermsDocumentView/TermsDocumentView'
import { TermsEditor } from '../../features/terms/TermsEditor'
import { TermsSkeleton } from '../../features/terms/TermsSkeleton/TermsSkeleton'
import { useTermsPageViewModel } from './TermsPage.viewModel'

/**
 * The terms and conditions as a page (the admin's last tab). The admin edits them here: sections,
 * paragraphs and bullet lists. Visitors read them in the popup from the footer.
 */
export function TermsPage() {
  const vm = useTermsPageViewModel()
  const { state, editing } = vm

  const heading = <h2 className="visually-hidden">Terms and Conditions</h2>
  if (state.status === 'loading')
    return (
      <>
        {heading}
        <div className="card">
          <TermsSkeleton />
        </div>
      </>
    )
  if (state.status === 'error')
    return (
      <>
        {heading}
        <ErrorState message="The terms couldn't be loaded." onRetry={vm.reload} />
      </>
    )

  const terms = state.data

  if (editing) {
    return (
      <section className="card terms-page" aria-labelledby="terms-editor-title">
        <h2 id="terms-editor-title" className="terms-page-heading">
          Edit the terms
        </h2>
        <form className="about-editor" noValidate onSubmit={vm.save} aria-label="Edit the terms">
          <TermsEditor value={editing.draft} onChange={vm.change} errors={editing.errors} />
          {editing.message && (
            <p role="alert" className="form-error">
              {editing.message}
            </p>
          )}
          <p className="editor-note">Saving changes the date at the top, and asks every visitor to accept the terms again.</p>
          <div className="about-editor-actions">
            <button type="submit" className="button" disabled={vm.saving}>
              {vm.saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="button button-secondary" disabled={vm.saving} onClick={vm.cancel}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    )
  }

  return (
    <section className="card terms-page" aria-label="Terms and Conditions">
      {vm.canEdit && (
        <div className="terms-page-actions">
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={vm.edit}
          >
            <PencilIcon size={16} />
            Edit <span className="visually-hidden">the terms</span>
          </button>
        </div>
      )}
      <TermsDocumentView terms={terms} />
    </section>
  )
}
