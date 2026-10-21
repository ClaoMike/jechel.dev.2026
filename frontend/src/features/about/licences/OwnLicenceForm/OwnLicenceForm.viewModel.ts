import { useId, useState, type KeyboardEvent } from 'react'
import { LICENCE_CATEGORIES, type Licence, type LicenceCategory } from '../../../../services/api'
import { LICENCE_CATEGORY_LABELS } from '../licences'

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
    categories: LICENCE_CATEGORIES.map((category) => ({ value: category, label: LICENCE_CATEGORY_LABELS[category] })),
    setCategory: (category: string) => {
      setDraft({ ...draft, category: category as LicenceCategory })
    },
    // Enter adds it instead of submitting the section's form.
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        add()
      }
    },
    draft,
    error,
    change: (patch: Partial<Licence>) => {
      setDraft({ ...draft, ...patch })
      if (patch.name !== undefined) setError(null)
    },
    add,
  }
}
