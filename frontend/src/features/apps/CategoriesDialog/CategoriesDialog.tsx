import { useId, useState } from 'react'
import { DiscardChangesDialog } from '../../../components/DiscardChangesDialog/DiscardChangesDialog'
import { AddButton } from '../../../components/fields'
import { Modal } from '../../../components/Modal/Modal'
import { CategoryRow } from '../CategoryRow/CategoryRow'
import type { AppCategory, AppCategoryRequest } from '../../../services/api'
import { useSaveAppCategoriesMutation } from '../../../store/api/appsApi'
import { fieldErrorsOf, saveFailedMessage, type FieldErrors } from '../../../utils/saveErrors'
import { move, removeAt, replaceAt } from '../../about/list'

export interface CategoriesDialogProps {
  categories: AppCategory[]
  onClose: () => void
  onSaved: (categories: AppCategory[]) => void
}

/**
 * The admin's list of app categories: rename, reorder (apps show their labels in this order),
 * add and remove them. Saved together; removing one takes it off every app.
 */
export function CategoriesDialog(props: CategoriesDialogProps) {
  // A draft of the list, saved together.
  const { categories, onClose, onSaved } = props
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
  const titleId = useId()
  const rows = draft.map((category, i) => ({
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
  }))
  const requestClose = () => (dirty ? setAskDiscard(true) : onClose())
  const add = () => setDraft([...draft, { id: null, name: '' }])
  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault()
    void save()
  }
  const saveLabel = saving ? 'Saving…' : 'Save'
  const stopAskingDiscard = () => setAskDiscard(false)

  return (
    <Modal labelledBy={titleId} onClose={requestClose}>
      <div className="modal-header">
        <h2 id={titleId}>App categories</h2>
        <button type="button" className="icon-button" onClick={requestClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <form className="app-form" noValidate onSubmit={submit}>
        <p className="muted editor-note">Apps show their categories as labels, in this order. Removing one takes it off every app.</p>
        <ol className="category-list">
          {rows.map(({ key, ...row }) => (
            <CategoryRow key={key} {...row} />
          ))}
        </ol>
        <AddButton onClick={add}>Add category</AddButton>
        {message && (
          <p className="field-error" role="alert">
            {message}
          </p>
        )}
        <div className="app-form-actions">
          <button type="button" className="button button-secondary" onClick={props.onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="button" disabled={saving}>
            {saveLabel}
          </button>
        </div>
      </form>
      {askDiscard && <DiscardChangesDialog detail="Your changes to the categories aren't saved." onDiscard={props.onClose} onClose={stopAskingDiscard} />}
    </Modal>
  )
}
