import { useId, useState } from 'react'
import { DiscardChangesDialog } from '../../../components/DiscardChangesDialog/DiscardChangesDialog'
import { PencilIcon } from '../../../components/icons/icons'
import { Modal } from '../../../components/Modal/Modal'
import type { AppCategory, AppDetails, AppRequest } from '../../../services/api'
import { useDeleteAppMutation, useSaveAppMutation } from '../../../store/api/appsApi'
import { fieldErrorsOf, saveFailedMessage, type FieldErrors } from '../../../utils/saveErrors'
import { AppDetailsView } from '../AppDetailsView/AppDetailsView'
import { AppDialogHeader } from '../AppDialogHeader/AppDialogHeader'
import { AppForm } from '../AppForm/AppForm'

export interface AppDialogProps {
  /** Null: adding a new app. */
  app: AppDetails | null
  /** Every category, to choose from when editing. */
  categories: AppCategory[]
  canEdit: boolean
  onClose: () => void
  onSaved: (app: AppDetails) => void
  onDeleted: (id: number) => void
}

const EMPTY: AppRequest = { title: '', description: '', categoryIds: [], platforms: [], links: [], media: [], showInWhatsNew: true }
const toRequest = ({ title, description, categories, platforms, links, media, showInWhatsNew }: AppDetails): AppRequest => ({
  title,
  description,
  categoryIds: categories.map((c) => c.id),
  platforms,
  links,
  media,
  showInWhatsNew,
})

/**
 * An app's details: its images and videos in a slider, title and description. The admin can
 * edit it in the same popup (a draft of it), and a new app opens straight in the form.
 */
export function AppDialog({ app, categories, canEdit, onClose, onSaved, onDeleted }: AppDialogProps) {
  const [draft, setDraft] = useState<AppRequest | null>(app ? null : EMPTY)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [askDiscard, setAskDiscard] = useState(false)
  const [saveApp, { isLoading: saving }] = useSaveAppMutation()
  const [deleteApp] = useDeleteAppMutation()

  const original = app ? toRequest(app) : EMPTY
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(original)

  async function save() {
    if (!draft) return
    setMessage(null)
    try {
      const saved = await saveApp({ id: app?.id ?? null, app: draft }).unwrap()
      setErrors({})
      setDraft(null)
      onSaved(saved)
    } catch (error) {
      const fields = fieldErrorsOf(error)
      setErrors(fields ?? {})
      setMessage(fields ? 'Some fields need fixing.' : saveFailedMessage(error))
    }
  }

  const remove = async () => {
    if (!app) return
    await deleteApp(app.id).unwrap()
    onDeleted(app.id)
  }
  const stopEditing = () => {
    if (app) setDraft(null)
    else onClose()
    setErrors({})
    setMessage(null)
  }
  const titleId = useId()
  // Escape, × or a click outside: ask first if there are unsaved changes.
  const requestClose = () => (dirty ? setAskDiscard(true) : onClose())

  return (
    <Modal labelledBy={titleId} onClose={requestClose} className="modal-wide">
      <AppDialogHeader
        titleId={titleId}
        // A new app just saved has no draft for a moment, until the page shows it in its own popup.
        heading={app ? (draft ? `Edit ${app.title}` : app.title) : 'Add an app'}
        headingIsName={!!app && !draft}
        // The app's labels by its title while it's shown, not while it's edited.
        categories={draft === null && app ? app.categories : []}
        onClose={requestClose}
      />
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
      {draft && (
        <AppForm
          draft={draft}
          categories={categories}
          errors={errors}
          mediaError={errors.media ?? Object.entries(errors).find(([key]) => key.startsWith('media['))?.[1]}
          message={message}
          saving={saving}
          saveLabel={saving ? 'Saving…' : app === null ? 'Add app' : 'Save'}
          deletable={app && { title: app.title, remove }}
          change={(patch) => setDraft((current) => current && { ...current, ...patch })}
          updateMedia={(change) => setDraft((current) => current && { ...current, media: change(current.media) })}
          cancel={stopEditing}
          submit={(event) => {
            event.preventDefault()
            void save()
          }}
        />
      )}
      {askDiscard && <DiscardChangesDialog detail="What you changed in this app isn't saved." onDiscard={onClose} onClose={() => setAskDiscard(false)} />}
    </Modal>
  )
}
