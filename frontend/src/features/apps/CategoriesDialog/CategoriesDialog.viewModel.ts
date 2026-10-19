import { useId, useState } from 'react'
import type { AppCategory, AppCategoryRequest } from '../../../services/api'
import { useSaveAppCategoriesMutation } from '../../../store/api/appsApi'
import { fieldErrorsOf, saveFailedMessage, type FieldErrors } from '../../../utils/saveErrors'
import { move, removeAt, replaceAt } from '../../about/list'

export interface CategoriesDialogProps {
  categories: AppCategory[]
  onClose: () => void
  onSaved: (categories: AppCategory[]) => void
}

/** A draft of the list, saved together. */
export function useCategoriesDialogViewModel({ categories, onClose, onSaved }: CategoriesDialogProps) {
  const [draft, setDraft] = useState<AppCategoryRequest[]>(categories)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [askDiscard, setAskDiscard] = useState(false)
  const [saveCategories, { isLoading: saving }] = useSaveAppCategoriesMutation()

  const dirty = JSON.stringify(draft) !== JSON.stringify(categories)

  async function save() {
    setMessage(null)
    try {
      onSaved(await saveCategories(draft.map(({ id, name }) => ({ id, name }))).unwrap())
    } catch (error) {
      const fields = fieldErrorsOf(error)
      setErrors(fields ?? {})
      setMessage(fields ? (fields[''] ?? 'Some names need fixing.') : saveFailedMessage(error))
    }
  }

  return {
    titleId: useId(),
    rows: draft.map((category, i) => ({
      key: category.id ?? `new-${i}`,
      label: `Category ${i + 1}`,
      name: category.name.trim() || `category ${i + 1}`,
      value: category.name,
      error: errors[`[${i}].name`] ?? errors[`[${i}].id`],
      index: i,
      count: draft.length,
      onRename: (name: string) => setDraft(replaceAt(draft, i, { ...draft[i], name })),
      onMove: (from: number, to: number) => setDraft(move(draft, from, to)),
      onRemove: () => setDraft(removeAt(draft, i)),
    })),
    message,
    saving,
    requestClose: () => (dirty ? setAskDiscard(true) : onClose()),
    add: () => setDraft([...draft, { id: null, name: '' }]),
    submit: (event: { preventDefault: () => void }) => {
      event.preventDefault()
      void save()
    },
    saveLabel: saving ? 'Saving…' : 'Save',
    askDiscard,
    stopAskingDiscard: () => setAskDiscard(false),
  }
}
