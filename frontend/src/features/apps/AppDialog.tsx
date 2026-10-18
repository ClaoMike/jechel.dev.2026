import { useId, useState } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DeleteButton } from '../../components/DeleteButton'
import { PencilIcon, TrashIcon } from '../../components/icons'
import { Modal } from '../../components/Modal'
import { ApiError, api, type AppCategory, type AppDetails, type AppRequest } from '../../services/api'
import { TextField, type FieldErrors } from '../about/fields'
import { CategoryLabels, CategoryPicker, LinksEditor, PlatformsEditor } from './AppFields'
import { AppDetailsView } from './AppDetailsView'
import { MediaListEditor } from './MediaListEditor'

interface AppDialogProps {
  /** Null: adding a new app. */
  app: AppDetails | null
  /** Every category, to choose from when editing. */
  categories: AppCategory[]
  canEdit: boolean
  onClose: () => void
  onSaved: (app: AppDetails) => void
  onDeleted: (id: number) => void
}

const EMPTY: AppRequest = { title: '', description: '', categoryIds: [], platforms: [], links: [], media: [] }
const toRequest = ({ title, description, categories, platforms, links, media }: AppDetails): AppRequest => ({
  title,
  description,
  categoryIds: categories.map((c) => c.id),
  platforms,
  links,
  media,
})

/**
 * An app's details: its images and videos in a slider, title and description. The admin can
 * edit it in the same popup, and a new app opens straight in the form.
 */
export function AppDialog({ app, categories, canEdit, onClose, onSaved, onDeleted }: AppDialogProps) {
  const titleId = useId()
  const [draft, setDraft] = useState<AppRequest | null>(app ? null : EMPTY)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [askDiscard, setAskDiscard] = useState(false)

  const original = app ? toRequest(app) : EMPTY
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(original)

  // Escape, × or a click outside: ask first if there are unsaved changes.
  const requestClose = () => (dirty ? setAskDiscard(true) : onClose())

  const stopEditing = () => {
    if (app) setDraft(null)
    else onClose()
    setErrors({})
    setMessage(null)
  }

  async function save() {
    if (!draft) return
    setSaving(true)
    setMessage(null)
    try {
      const saved = app ? await api.apps.update(app.id, draft) : await api.apps.create(draft)
      setErrors({})
      setDraft(null)
      onSaved(saved)
    } catch (e) {
      if (e instanceof ApiError && e.validationErrors) {
        setErrors(Object.fromEntries(Object.entries(e.validationErrors).map(([key, messages]) => [key, messages[0]])))
        setMessage('Some fields need fixing.')
      } else {
        setMessage(e instanceof ApiError && e.status === 401 ? 'Your session has ended. Sign in again, then save.' : "Couldn't save. Please try again.")
      }
    } finally {
      setSaving(false)
    }
  }

  const heading = draft ? (app ? `Edit ${app.title}` : 'Add an app') : app!.title
  const mediaError = errors.media ?? Object.entries(errors).find(([key]) => key.startsWith('media['))?.[1]

  return (
    <Modal labelledBy={titleId} onClose={requestClose} className="modal-wide">
      <div className="modal-header">
        <div className="app-heading">
          <h2 id={titleId}>{heading}</h2>
          {draft === null && app && <CategoryLabels categories={app.categories} />}
        </div>
        <button type="button" className="icon-button" onClick={requestClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
      </div>

      {draft === null && app && (
        <AppDetailsView app={app}>
          {canEdit && (
            <div className="app-actions">
              <button type="button" className="button button-secondary button-small" onClick={() => setDraft(toRequest(app))}>
                <PencilIcon size={16} />
                Edit
              </button>
            </div>
          )}
        </AppDetailsView>
      )}

      {draft !== null && (
        <form
          className="app-form"
          // The API's messages show under the fields, as everywhere else on the site.
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <TextField label="Title" value={draft.title} required onChange={(title) => setDraft({ ...draft, title })} error={errors.title} />
          <CategoryPicker categories={categories} value={draft.categoryIds} onChange={(categoryIds) => setDraft({ ...draft, categoryIds })} error={errors.categoryIds} />
          <TextField label="Description" multiline allowLinks value={draft.description} onChange={(description) => setDraft({ ...draft, description })} error={errors.description} />
          <PlatformsEditor value={draft.platforms} onChange={(platforms) => setDraft({ ...draft, platforms })} error={errors.platforms} />
          <LinksEditor value={draft.links} onChange={(links) => setDraft({ ...draft, links })} errors={errors} />
          <MediaListEditor value={draft.media} update={(change) => setDraft((current) => current && { ...current, media: change(current.media) })} error={mediaError} />
          {message && (
            <p className="field-error" role="alert">
              {message}
            </p>
          )}
          <div className="app-form-actions">
            {app && (
              <DeleteButton
                what={app.title}
                detail="It's removed from the Apps page, with its images and videos. This can't be undone."
                onDelete={async () => {
                  await api.apps.delete(app.id)
                  onDeleted(app.id)
                }}
                className="button button-secondary button-small app-delete"
                label="Delete app"
              >
                <TrashIcon size={16} />
                Delete app
              </DeleteButton>
            )}
            <button type="button" className="button button-secondary" onClick={stopEditing} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="button" disabled={saving}>
              {saving ? 'Saving…' : app ? 'Save' : 'Add app'}
            </button>
          </div>
        </form>
      )}

      {askDiscard && (
        <ConfirmDialog title="Discard your changes?" confirmLabel="Discard" onConfirm={onClose} onClose={() => setAskDiscard(false)}>
          <p>What you changed in this app isn't saved.</p>
        </ConfirmDialog>
      )}
    </Modal>
  )
}
