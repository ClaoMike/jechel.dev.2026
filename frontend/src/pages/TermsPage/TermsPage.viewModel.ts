import { useState, type FormEvent } from 'react'
import { useAuth } from '../../auth'
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

/** The terms from the store, and the admin's draft of them: saving shows them to everyone on this page (and asks visitors again). */
export function useTermsPageViewModel() {
  const { isAuthenticated } = useAuth()
  const { state, reload } = useTerms()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [updateTerms, { isLoading: saving }] = useUpdateTermsMutation()

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || saving) return
    setEditing((current) => current && { ...current, message: null })
    try {
      await updateTerms(editing.draft).unwrap()
      setEditing(null)
    } catch (error) {
      // Onto the draft as it is now: anything typed while it was saving stays.
      setEditing((current) => current && { ...current, ...describeError(error) })
    }
  }

  return {
    state,
    reload,
    canEdit: isAuthenticated,
    editing: isAuthenticated ? editing : null,
    saving,
    edit: () => {
      if (state.status !== 'loaded') return
      const { title, intro, sections } = state.data
      setEditing({ draft: { title, intro, sections: structuredClone(sections) }, errors: {}, message: null })
    },
    change: (draft: TermsContent) => setEditing((current) => current && { ...current, draft }),
    cancel: () => setEditing(null),
    save: (event: FormEvent<HTMLFormElement>) => void save(event),
  }
}
