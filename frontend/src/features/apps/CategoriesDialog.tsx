import { useId, useState } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Modal } from '../../components/Modal'
import { ApiError, api, type AppCategory, type AppCategoryRequest } from '../../services/api'
import { AddButton, ItemControls, TextField, type FieldErrors } from '../about/fields'
import { move, removeAt, replaceAt } from '../about/list'

/**
 * The admin's list of app categories: rename, reorder (apps show their labels in this order),
 * add and remove them. Saved together; removing one takes it off every app.
 */
export function CategoriesDialog({ categories, onClose, onSaved }: { categories: AppCategory[]; onClose: () => void; onSaved: (categories: AppCategory[]) => void }) {
  const titleId = useId()
  const [draft, setDraft] = useState<AppCategoryRequest[]>(categories)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [askDiscard, setAskDiscard] = useState(false)

  const dirty = JSON.stringify(draft) !== JSON.stringify(categories)
  const requestClose = () => (dirty ? setAskDiscard(true) : onClose())

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      onSaved(await api.apps.saveCategories(draft.map(({ id, name }) => ({ id, name }))))
    } catch (e) {
      if (e instanceof ApiError && e.validationErrors) {
        setErrors(Object.fromEntries(Object.entries(e.validationErrors).map(([key, messages]) => [key, messages[0]])))
        setMessage(e.validationErrors['']?.[0] ?? 'Some names need fixing.')
      } else {
        setMessage(e instanceof ApiError && e.status === 401 ? 'Your session has ended. Sign in again, then save.' : "Couldn't save. Please try again.")
      }
      setSaving(false)
    }
  }

  return (
    <Modal labelledBy={titleId} onClose={requestClose}>
      <header className="modal-header">
        <h2 id={titleId}>App categories</h2>
        <button type="button" className="icon-button" onClick={requestClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <form
        className="app-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <p className="muted editor-note">Apps show their categories as labels, in this order. Removing one takes it off every app.</p>
        <ol className="category-list">
          {draft.map((category, i) => (
            <li key={category.id ?? `new-${i}`} className="category-row">
              <TextField label={`Category ${i + 1}`} value={category.name} onChange={(name) => setDraft(replaceAt(draft, i, { ...category, name }))} error={errors[`[${i}].name`] ?? errors[`[${i}].id`]} />
              <ItemControls name={category.name.trim() || `category ${i + 1}`} index={i} count={draft.length} onMove={(from, to) => setDraft(move(draft, from, to))} onRemove={() => setDraft(removeAt(draft, i))} />
            </li>
          ))}
        </ol>
        <AddButton onClick={() => setDraft([...draft, { id: null, name: '' }])}>Add category</AddButton>
        {message && (
          <p className="field-error" role="alert">
            {message}
          </p>
        )}
        <div className="app-form-actions">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="button" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
      {askDiscard && (
        <ConfirmDialog title="Discard your changes?" confirmLabel="Discard" onConfirm={onClose} onClose={() => setAskDiscard(false)}>
          <p>Your changes to the categories aren't saved.</p>
        </ConfirmDialog>
      )}
    </Modal>
  )
}
