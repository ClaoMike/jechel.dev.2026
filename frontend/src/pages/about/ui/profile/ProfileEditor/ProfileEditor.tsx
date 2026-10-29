import { TextField, type EditorProps } from '@/shared/ui/fields'
import type { AboutLinks, ResumeContact } from '@/shared/api'
import { FileUpload } from '../../FileUpload/FileUpload'
import { isSafeUrl } from '@/shared/lib/format'
import { PHOTO_MAX_BYTES } from '@/shared/lib/forms'
import type { Profile } from '../../../lib/profile'
import { ProfilePhoto } from '../ProfilePhoto/ProfilePhoto'
import { StatusesEditor } from '../StatusesEditor/StatusesEditor'
import { strings } from '@/shared/i18n'

/** The photo, the résumé's contact (admin only), the labels and the links. */
export function ProfileEditor({ value, onChange, update, errors }: EditorProps<Profile>) {
  const contact = value.contact ?? null
  const setContact = (key: keyof ResumeContact) => (text: string) => onChange({ ...value, contact: { ...value.contact!, [key]: text } })
  const setLink = (key: keyof AboutLinks) => (url: string) => onChange({ ...value, links: { ...value.links, [key]: url } })

  return (
    <div className="editor-list">
      <div className="upload-grid">
        <FileUpload
          label={strings.profileEditor.photo}
          accept="image/jpeg,image/png,image/webp,image/gif"
          maxBytes={PHOTO_MAX_BYTES}
          hint={strings.profileEditor.jpegPngWebpGif}
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
          <legend>{strings.profileEditor.rSum}</legend>
          <div className="editor-grid">
            <TextField
              label={strings.profileEditor.headline}
              value={contact.headline}
              onChange={setContact('headline')}
              error={errors['contact.headline']}
              placeholder={strings.profileEditor.fullStackEngineerNet}
            />
            <TextField
              label={strings.common.email}
              type="email"
              value={contact.email}
              onChange={setContact('email')}
              error={errors['contact.email']}
              labelClassName="label-admin"
            />
            <TextField
              label={strings.profileEditor.phone}
              type="tel"
              value={contact.phone}
              onChange={setContact('phone')}
              error={errors['contact.phone']}
              labelClassName="label-admin"
            />
          </div>
        </fieldset>
      )}
      <fieldset className="editor-item">
        <legend>{strings.common.citizenshipResidence}</legend>
        <StatusesEditor value={value.statuses} onChange={(statuses) => onChange({ ...value, statuses })} errors={errors} />
      </fieldset>
      <div className="editor-grid">
        <TextField
          label={strings.profileEditor.githubUrl}
          type="url"
          value={value.links.gitHubUrl}
          onChange={setLink('gitHubUrl')}
          error={errors['links.gitHubUrl']}
          hint={strings.profileEditor.leaveEmptyHide}
        />
        <TextField label={strings.profileEditor.linkedinUrl} type="url" value={value.links.linkedInUrl} onChange={setLink('linkedInUrl')} error={errors['links.linkedInUrl']} />
        <TextField label={strings.profileEditor.instagramUrl} type="url" value={value.links.instagramUrl} onChange={setLink('instagramUrl')} error={errors['links.instagramUrl']} />
      </div>
    </div>
  )
}
