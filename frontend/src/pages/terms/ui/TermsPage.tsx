import { useState, type FormEvent } from 'react'
import { useAuth } from '@/entities/session'
import { PencilIcon } from '@/shared/ui/icons'
import { ErrorState } from '@/shared/ui/ErrorState'
import { TermsDocumentView } from '@/entities/terms-of-use'
import { TermsEditor } from './TermsEditor'
import { TermsSkeleton } from '@/entities/terms-of-use'
import { useTerms } from '@/entities/terms-of-use'
import { failureOf, type TermsContent } from '@/shared/api'
import { useUpdateTermsMutation } from '@/entities/terms-of-use'
import { fieldErrorsOf, type FieldErrors } from '@/shared/lib/forms'
import { strings } from '@/shared/i18n'

type Editing = { draft: TermsContent; errors: FieldErrors; message: string | null }

function describeError(error: unknown): { errors: FieldErrors; message: string } {
  const errors = fieldErrorsOf(error)
  if (errors) return { errors, message: strings.termsPage.someFieldsNeedFixing }
  if (failureOf(error).status === 401) return { errors: {}, message: strings.common.sessionHasEndedSign }
  return { errors: {}, message: strings.common.couldntSavePleaseTry }
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

  const heading = <h2 className="visually-hidden">{strings.common.termsConditions}</h2>
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
        <ErrorState message={strings.termsPage.termsCouldntLoaded} onRetry={reload} />
      </>
    )

  const terms = state.data

  if (editing) {
    return (
      <section className="card terms-page" aria-labelledby="terms-editor-title">
        <h2 id="terms-editor-title" className="terms-page-heading">
          {strings.termsPage.editTerms}
        </h2>
        <form className="about-editor" noValidate onSubmit={(event) => void save(event)} aria-label={strings.termsPage.editTerms}>
          <TermsEditor value={editing.draft} onChange={(next) => setDraft((current) => current && { ...current, draft: next })} errors={editing.errors} />
          {editing.message && (
            <p role="alert" className="form-error">
              {editing.message}
            </p>
          )}
          <p className="editor-note">{strings.termsPage.savingChangesDateTop}</p>
          <div className="about-editor-actions">
            <button type="submit" className="button" disabled={saving}>
              {saving ? strings.common.saving : strings.common.save}
            </button>
            <button type="button" className="button button-secondary" disabled={saving} onClick={() => setDraft(null)}>
              {strings.common.cancel}
            </button>
          </div>
        </form>
      </section>
    )
  }

  return (
    <section className="card terms-page" aria-label={strings.common.termsConditions}>
      {isAuthenticated && (
        <div className="terms-page-actions">
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => setDraft({ draft: { title: terms.title, intro: terms.intro, sections: structuredClone(terms.sections) }, errors: {}, message: null })}
          >
            <PencilIcon size={16} />
            {strings.common.edit}
            <span className="visually-hidden">{strings.termsPage.terms}</span>
          </button>
        </div>
      )}
      <TermsDocumentView terms={terms} />
    </section>
  )
}
