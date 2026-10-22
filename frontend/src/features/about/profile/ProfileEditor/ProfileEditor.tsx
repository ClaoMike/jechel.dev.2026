import { TextField, type EditorProps } from '../../../../components/fields'
import { FileUpload } from '../../FileUpload/FileUpload'
import type { Profile } from '../profile'
import { ProfilePhoto } from '../ProfilePhoto/ProfilePhoto'
import { StatusesEditor } from '../StatusesEditor/StatusesEditor'
import { useProfileEditorViewModel } from './ProfileEditor.viewModel'

/** The photo, the résumé's contact (admin only), the labels and the links. */
export function ProfileEditor(props: EditorProps<Profile>) {
  const { value, errors } = props
  const vm = useProfileEditorViewModel(props)

  return (
    <div className="editor-list">
      <div className="upload-grid">
        <FileUpload
          label="Photo"
          accept="image/jpeg,image/png,image/webp,image/gif"
          maxBytes={vm.photo.maxBytes}
          hint="JPEG, PNG, WebP or GIF, up to 15 MB. It's resized, and its location data is removed."
          kind="photo"
          onUploaded={(file) => vm.photo.uploaded(file.url)}
          onRemove={vm.photo.remove}
          error={errors.photoUrl}
        >
          <ProfilePhoto url={vm.photo.url} />
        </FileUpload>
      </div>
      {vm.contact && (
        <fieldset className="editor-item">
          <legend>For the résumé</legend>
          <div className="editor-grid">
            <TextField label="Headline" value={vm.contact.headline} onChange={vm.setContact('headline')} error={errors['contact.headline']} placeholder="Full-stack engineer · .NET, React, PostgreSQL" />
            <TextField label="Email" type="email" value={vm.contact.email} onChange={vm.setContact('email')} error={errors['contact.email']} labelClassName="label-admin" />
            <TextField label="Phone" type="tel" value={vm.contact.phone} onChange={vm.setContact('phone')} error={errors['contact.phone']} labelClassName="label-admin" />
          </div>
        </fieldset>
      )}
      <fieldset className="editor-item">
        <legend>Citizenship and residence</legend>
        <StatusesEditor value={value.statuses} onChange={vm.setStatuses} errors={errors} />
      </fieldset>
      <div className="editor-grid">
        <TextField label="GitHub URL" type="url" value={value.links.gitHubUrl} onChange={vm.setLink('gitHubUrl')} error={errors['links.gitHubUrl']} hint="Leave empty to hide it." />
        <TextField label="LinkedIn URL" type="url" value={value.links.linkedInUrl} onChange={vm.setLink('linkedInUrl')} error={errors['links.linkedInUrl']} />
        <TextField label="Instagram URL" type="url" value={value.links.instagramUrl} onChange={vm.setLink('instagramUrl')} error={errors['links.instagramUrl']} />
      </div>
    </div>
  )
}
