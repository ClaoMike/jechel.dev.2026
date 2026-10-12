import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
import { PencilIcon } from '../components/icons'
import type { FieldErrors } from '../features/about/fields'
import { useTerms } from '../features/terms'
import { TermsDocumentView } from '../features/terms/TermsDocumentView'
import { TermsEditor } from '../features/terms/TermsEditor'
import { api, ApiError, type TermsContent } from '../services/api'

type Editing = { state: 'editing' | 'saving'; draft: TermsContent; errors: FieldErrors; message: string | null }

/**
 * The terms and conditions as a page (the admin's last tab). The admin edits them here: sections,
 * paragraphs and bullet lists. Visitors read them in the popup from the footer.
 */
export function TermsPage() {
  const { isAuthenticated } = useAuth()
  const { state, replaceTerms } = useTerms()
  const [editing, setEditing] = useState<Editing | null>(null)

  const heading = <h2 className="visually-hidden">Terms and Conditions</h2>
  if (state.status === 'loading')
    return (
      <>
        {heading}
        <p>Loading…</p>
      </>
    )
  if (state.status === 'error')
    return (
      <>
        {heading}
        <p role="alert">The terms couldn't be loaded. Please try again later.</p>
      </>
    )

  const { terms } = state

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || editing.state === 'saving') return
    setEditing({ ...editing, state: 'saving', message: null })
    try {
      replaceTerms(await api.terms.update(editing.draft))
      setEditing(null)
    } catch (error) {
      setEditing({ ...editing, state: 'editing', ...describeError(error) })
    }
  }

  if (editing && isAuthenticated) {
    return (
      <section className="card terms-page" aria-labelledby="terms-editor-title">
        <h2 id="terms-editor-title" className="terms-page-heading">
          Edit the terms
        </h2>
        <form className="about-editor" noValidate onSubmit={(event) => void save(event)} aria-label="Edit the terms">
          <TermsEditor value={editing.draft} onChange={(draft) => setEditing({ ...editing, draft })} errors={editing.errors} />
          {editing.message && (
            <p role="alert" className="form-error">
              {editing.message}
            </p>
          )}
          <p className="editor-note">Saving changes the date at the top, and asks every visitor to accept the terms again.</p>
          <div className="about-editor-actions">
            <button type="submit" className="button" disabled={editing.state === 'saving'}>
              {editing.state === 'saving' ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="button button-secondary" disabled={editing.state === 'saving'} onClick={() => setEditing(null)}>
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
            onClick={() =>
              setEditing({ state: 'editing', draft: { title: terms.title, intro: terms.intro, sections: structuredClone(terms.sections) }, errors: {}, message: null })
            }
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

function describeError(error: unknown): { errors: FieldErrors; message: string } {
  if (error instanceof ApiError && error.validationErrors) {
    const errors: FieldErrors = {}
    for (const [key, messages] of Object.entries(error.validationErrors)) errors[key] = messages[0]
    return { errors, message: 'Some fields need fixing; see the messages above.' }
  }
  if (error instanceof ApiError && error.status === 401) {
    return { errors: {}, message: 'Your session has ended. Sign in again, then save.' }
  }
  return { errors: {}, message: "Couldn't save. Please try again." }
}
