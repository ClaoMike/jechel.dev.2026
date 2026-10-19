import { useId, useState } from 'react'
import type { Licence } from '../../../services/api'

/** A licence that isn't offered, being typed: kind, optional code, and name. */
export function useOwnLicenceFormViewModel(onAdd: (licence: Licence) => void) {
  const [draft, setDraft] = useState<Licence>({ category: 'driving', code: '', name: '' })
  const [error, setError] = useState<string | null>(null)

  function add() {
    if (!draft.name.trim()) {
      setError('Enter what the licence is for.')
      return
    }
    onAdd({ category: draft.category, code: draft.code.trim(), name: draft.name.trim() })
    setDraft({ ...draft, code: '', name: '' })
    setError(null)
  }

  return {
    categoryId: useId(),
    draft,
    error,
    change: (patch: Partial<Licence>) => {
      setDraft({ ...draft, ...patch })
      if (patch.name !== undefined) setError(null)
    },
    add,
  }
}
