import type { FormEvent } from 'react'
import { DeleteButton } from '../../../components/DeleteButton/DeleteButton'
import { TextField, type FieldErrors } from '../../../components/fields'
import { OnOffSwitch } from '../../../components/OnOffSwitch/OnOffSwitch'
import { TrashIcon } from '../../../components/icons/icons'
import type { AppCategory, AppRequest } from '../../../services/api'
import { CategoryPicker } from '../CategoryPicker/CategoryPicker'
import { LinksEditor } from '../LinksEditor/LinksEditor'
import { MediaListEditor } from '../MediaListEditor/MediaListEditor'
import { PlatformsEditor } from '../PlatformsEditor/PlatformsEditor'

export interface AppFormProps {
  draft: AppRequest
  categories: AppCategory[]
  errors: FieldErrors
  mediaError?: string
  /** Why saving failed, if it did. */
  message: string | null
  saving: boolean
  /** "Add app", "Save" or "Saving…". */
  saveLabel: string
  /** An app already saved can be deleted (after a confirmation). */
  deletable: { title: string; remove: () => Promise<void> } | null
  change: (patch: Partial<AppRequest>) => void
  updateMedia: (change: (media: AppRequest['media']) => AppRequest['media']) => void
  cancel: () => void
  submit: (event: FormEvent<HTMLFormElement>) => void
}

/**
 * An app's fields: title, categories, whether What's new? may show it, description, platforms, store links, images
 * and videos; then delete, cancel and save.
 */
export function AppForm({ draft, categories, errors, mediaError, message, saving, saveLabel, deletable, change, updateMedia, cancel, submit }: AppFormProps) {
  return (
    // The API's messages show under the fields, as everywhere else on the site.
    <form className="app-form" noValidate onSubmit={submit}>
      <TextField label="Title" value={draft.title} required onChange={(title) => change({ title })} error={errors.title} />
      <CategoryPicker categories={categories} value={draft.categoryIds} onChange={(categoryIds) => change({ categoryIds })} error={errors.categoryIds} />
      <div className="switch-field">
        <span className="switch-field-text">
          <span className="field-label">Show in What's new?</span>
          <span className="field-hint">Off: What's new? skips it, for the next app in the order (Organise) that's on.</span>
        </span>
        <OnOffSwitch label="Show in What's new?" on={draft.showInWhatsNew} onChange={(showInWhatsNew) => change({ showInWhatsNew })} />
      </div>
      <TextField label="Description" multiline allowLinks value={draft.description} onChange={(description) => change({ description })} error={errors.description} />
      <PlatformsEditor value={draft.platforms} onChange={(platforms) => change({ platforms })} error={errors.platforms} />
      <LinksEditor value={draft.links} onChange={(links) => change({ links })} errors={errors} />
      <MediaListEditor value={draft.media} update={updateMedia} error={mediaError} />
      {message && (
        <p className="field-error" role="alert">
          {message}
        </p>
      )}
      <div className="app-form-actions">
        {deletable && (
          <DeleteButton
            what={deletable.title}
            detail="It's removed from the Apps page, with its images and videos. This can't be undone."
            onDelete={deletable.remove}
            className="button button-secondary button-small app-delete"
            label="Delete app"
          >
            <TrashIcon size={16} />
            Delete app
          </DeleteButton>
        )}
        <button type="button" className="button button-secondary" onClick={cancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="button" disabled={saving}>
          {saveLabel}
        </button>
      </div>
    </form>
  )
}
