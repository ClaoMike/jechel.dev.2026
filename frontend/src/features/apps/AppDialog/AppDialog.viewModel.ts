import { useId, useState } from 'react'
import type { AppCategory, AppDetails, AppRequest } from '../../../services/api'
import { useDeleteAppMutation, useSaveAppMutation } from '../../../store/api/appsApi'
import { fieldErrorsOf, saveFailedMessage, type FieldErrors } from '../../../utils/saveErrors'

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

const EMPTY: AppRequest = { title: '', description: '', categoryIds: [], platforms: [], links: [], media: [] }
const toRequest = ({ title, description, categories, platforms, links, media }: AppDetails): AppRequest => ({
  title,
  description,
  categoryIds: categories.map((c) => c.id),
  platforms,
  links,
  media,
})

/** Showing the app, or a draft of it being edited (a new app starts as one), saving it, deleting it. */
export function useAppDialogViewModel({ app, categories, canEdit, onClose, onSaved, onDeleted }: AppDialogProps) {
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

  return {
    titleId,
    header: {
      titleId,
      heading: draft ? (app ? `Edit ${app.title}` : 'Add an app') : app!.title,
      // The app's labels by its title while it's shown, not while it's edited.
      categories: draft === null && app ? app.categories : [],
      /** Escape, × or a click outside: ask first if there are unsaved changes. */
      onClose: () => (dirty ? setAskDiscard(true) : onClose()),
    },
    /** Escape, × or a click outside: ask first if there are unsaved changes. */
    requestClose: () => (dirty ? setAskDiscard(true) : onClose()),
    /** The app on show (not while it's edited). */
    shown: draft === null ? app : null,
    canEdit,
    edit: () => app && setDraft(toRequest(app)),
    form: draft && {
      draft,
      categories,
      errors,
      mediaError: errors.media ?? Object.entries(errors).find(([key]) => key.startsWith('media['))?.[1],
      message,
      saving,
      saveLabel: saving ? 'Saving…' : app === null ? 'Add app' : 'Save',
      deletable: app && { title: app.title, remove },
      change: (patch: Partial<AppRequest>) => setDraft((current) => current && { ...current, ...patch }),
      updateMedia: (change: (media: AppRequest['media']) => AppRequest['media']) => setDraft((current) => current && { ...current, media: change(current.media) }),
      cancel: stopEditing,
      submit: (event: { preventDefault: () => void }) => {
        event.preventDefault()
        void save()
      },
    },
    askDiscard,
    stopAskingDiscard: () => setAskDiscard(false),
  }
}
