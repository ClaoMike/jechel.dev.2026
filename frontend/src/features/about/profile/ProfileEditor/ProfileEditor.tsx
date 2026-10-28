import { TextField, type EditorProps } from '../../../../components/fields'
import type { AboutLinks, ResumeContact } from '../../../../services/api'
import { FileUpload } from '../../FileUpload/FileUpload'
import { isSafeUrl } from '../../format'
import { PHOTO_MAX_BYTES } from '../../uploadLimits'
import type { Profile } from '../profile'
import { ProfilePhoto } from '../ProfilePhoto/ProfilePhoto'
import { StatusesEditor } from '../StatusesEditor/StatusesEditor'

/** The photo, the résumé's contact (admin only), the labels and the links. */
export function ProfileEditor({ value, onChange, update, errors }: EditorProps<Profile>) {
  const contact = value.contact ?? null
  const setContact = (key: keyof ResumeContact) => (text: string) => onChange({ ...value, contact: { ...value.contact!, [key]: text } })
  const setLink = (key: keyof AboutLinks) => (url: string) => onChange({ ...value, links: { ...value.links, [key]: url } })

  return (
    <div className="editor-list">
      <div className="upload-grid">
        <FileUpload
          label="Photo"
          accept="image/jpeg,image/png,image/webp,image/gif"
          maxBytes={PHOTO_MAX_BYTES}
          hint="JPEG, PNG, WebP or GIF, up to 15 MB. It's resized, and its location data is removed."
          kind="photo"
          onUploaded={(file) => update((current) => ({ ...current, photoUrl: file.url }))}
          onRemove={value.photoUrl ? () => onChange({ ...value, photoUrl: '' }) : undefined}
          error={errors.photoUrl}
        >
          <ProfilePhoto url={isSafeUrl(value.photoUrl) ? value.photoUrl : null} />
        </FileUpload>
      </div>
      {contact && (
        <fieldset className="editor-item">
          <legend>For the résumé</legend>
          <div className="editor-grid">
            <TextField
              label="Headline"
              value={contact.headline}
              onChange={setContact('headline')}
              error={errors['contact.headline']}
              placeholder="Full-stack engineer · .NET, React, PostgreSQL"
            />
            <TextField label="Email" type="email" value={contact.email} onChange={setContact('email')} error={errors['contact.email']} labelClassName="label-admin" />
            <TextField label="Phone" type="tel" value={contact.phone} onChange={setContact('phone')} error={errors['contact.phone']} labelClassName="label-admin" />
          </div>
        </fieldset>
      )}
      <fieldset className="editor-item">
        <legend>Citizenship and residence</legend>
        <StatusesEditor value={value.statuses} onChange={(statuses) => onChange({ ...value, statuses })} errors={errors} />
      </fieldset>
      <div className="editor-grid">
        <TextField label="GitHub URL" type="url" value={value.links.gitHubUrl} onChange={setLink('gitHubUrl')} error={errors['links.gitHubUrl']} hint="Leave empty to hide it." />
        <TextField label="LinkedIn URL" type="url" value={value.links.linkedInUrl} onChange={setLink('linkedInUrl')} error={errors['links.linkedInUrl']} />
        <TextField label="Instagram URL" type="url" value={value.links.instagramUrl} onChange={setLink('instagramUrl')} error={errors['links.instagramUrl']} />
      </div>
    </div>
  )
}
