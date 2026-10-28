import { useState, type FormEvent } from 'react'
import { useAuth } from '../../auth'
import { PencilIcon } from '../../components/icons/icons'
import { ErrorState } from '../../components/ErrorState/ErrorState'
import { TermsDocumentView } from '../../features/terms/TermsDocumentView/TermsDocumentView'
import { TermsEditor } from '../../features/terms/TermsEditor'
import { TermsSkeleton } from '../../features/terms/TermsSkeleton/TermsSkeleton'
import { useTerms } from '../../features/terms'
import { failureOf, type TermsContent } from '../../services/api'
import { useUpdateTermsMutation } from '../../store/api/termsApi'
import { fieldErrorsOf, type FieldErrors } from '../../utils/saveErrors'

type Editing = { draft: TermsContent; errors: FieldErrors; message: string | null }

function describeError(error: unknown): { errors: FieldErrors; message: string } {
  const errors = fieldErrorsOf(error)
  if (errors) return { errors, message: 'Some fields need fixing; see the messages above.' }
  if (failureOf(error).status === 401) return { errors: {}, message: 'Your session has ended. Sign in again, then save.' }
  return { errors: {}, message: "Couldn't save. Please try again." }
}

/**
 * The terms and conditions as a page (the admin's last tab). The admin edits them here: sections,
 * paragraphs and bullet lists; saving shows them to everyone (and asks visitors again). Visitors read them in the popup
 * from the footer.
 */
export function TermsPage() {
  const { isAuthenticated } = useAuth()
  const { state, reload } = useTerms()
  const [draft, setDraft] = useState<Editing | null>(null)
  const [updateTerms, { isLoading: saving }] = useUpdateTermsMutation()
  const editing = isAuthenticated ? draft : null

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || saving) return
    setDraft((current) => current && { ...current, message: null })
    try {
      await updateTerms(draft.draft).unwrap()
      setDraft(null)
    } catch (error) {
      // Onto the draft as it is now: anything typed while it was saving stays.
      setDraft((current) => current && { ...current, ...describeError(error) })
    }
  }

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
        <ErrorState message="The terms couldn't be loaded." onRetry={reload} />
      </>
    )

  const terms = state.data

  if (editing) {
    return (
      <section className="card terms-page" aria-labelledby="terms-editor-title">
        <h2 id="terms-editor-title" className="terms-page-heading">
          Edit the terms
        </h2>
        <form className="about-editor" noValidate onSubmit={(event) => void save(event)} aria-label="Edit the terms">
          <TermsEditor value={editing.draft} onChange={(next) => setDraft((current) => current && { ...current, draft: next })} errors={editing.errors} />
          {editing.message && (
            <p role="alert" className="form-error">
              {editing.message}
            </p>
          )}
          <p className="editor-note">Saving changes the date at the top, and asks every visitor to accept the terms again.</p>
          <div className="about-editor-actions">
            <button type="submit" className="button" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="button button-secondary" disabled={saving} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    )
  }

  return (
    <section className="card terms-page" aria-label="Terms and Conditions">
      {isAuthenticated && (
        <div className="terms-page-actions">
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => setDraft({ draft: { title: terms.title, intro: terms.intro, sections: structuredClone(terms.sections) }, errors: {}, message: null })}
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
