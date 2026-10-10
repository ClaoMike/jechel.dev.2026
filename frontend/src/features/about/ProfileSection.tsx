import type { ReactNode } from 'react'
import { DownloadIcon, GitHubIcon, InstagramIcon, LinkedInIcon, PersonIcon } from '../../components/icons'
import { api, type AboutLinks } from '../../services/api'
import { BulletsEditor } from './BulletsSection'
import { EditableSection } from './EditableSection'
import { FileUpload } from './FileUpload'
import { TextField, type EditorProps } from './fields'
import { fileNameOf, isSafeUrl } from './format'
import { RichText } from './RichText'

export interface Profile {
  photoUrl: string
  statuses: string[]
  links: AboutLinks
}

/** The photo, then citizenship / residence labels, then the résumé / GitHub / LinkedIn / Instagram links. */
export function ProfileSection({ value, canEdit, onSave }: { value: Profile; canEdit: boolean; onSave: (value: Profile) => Promise<void> }) {
  return (
    <EditableSection title="Photo and links" hideTitle errorKeys={['photoUrl', 'statuses', 'links']} className="profile-card" value={value} canEdit={canEdit} onSave={onSave} editor={ProfileEditor}>
      <div className="profile">
        <ProfilePhoto url={value.photoUrl} />
        {value.statuses.length > 0 && (
          <ul className="chips profile-statuses" aria-label="Citizenship and residence">
            {value.statuses.map((status, i) => (
              <li key={i} className="chip">
                <RichText text={status} />
              </li>
            ))}
          </ul>
        )}
        <ul className="profile-links" aria-label="Links">
          <ProfileLink href={value.links.resumeUrl} icon={<DownloadIcon />} download>
            Download résumé
          </ProfileLink>
          <ProfileLink href={value.links.gitHubUrl} icon={<GitHubIcon />}>
            GitHub
          </ProfileLink>
          <ProfileLink href={value.links.linkedInUrl} icon={<LinkedInIcon />}>
            LinkedIn
          </ProfileLink>
          <ProfileLink href={value.links.instagramUrl} icon={<InstagramIcon />}>
            Instagram
          </ProfileLink>
        </ul>
      </div>
    </EditableSection>
  )
}

function ProfilePhoto({ url }: { url: string }) {
  return isSafeUrl(url) ? (
    <img className="profile-photo" src={url} alt="Claudiu Jechel" />
  ) : (
    <div className="profile-photo profile-photo-placeholder" role="img" aria-label="Photo placeholder">
      <PersonIcon size={64} />
    </div>
  )
}

function ProfileLink({ href, icon, download = false, children }: { href: string; icon: ReactNode; download?: boolean; children: ReactNode }) {
  if (!isSafeUrl(href)) return null
  const external = !href.startsWith('/')
  return (
    <li>
      <a
        className="button button-secondary profile-link"
        href={href}
        download={download && !external ? '' : undefined}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
      >
        {icon}
        {children}
      </a>
    </li>
  )
}

function ProfileEditor({ value, onChange, update, errors }: EditorProps<Profile>) {
  const setLink = (key: keyof AboutLinks) => (url: string) => onChange({ ...value, links: { ...value.links, [key]: url } })
  // Uploads finish later, maybe both at once: each changes the latest draft, not the one it started from.
  const setResume = (url: string) => update((current) => ({ ...current, links: { ...current.links, resumeUrl: url } }))

  return (
    <div className="editor-list">
      <div className="upload-grid">
        <FileUpload
          label="Photo"
          accept="image/*"
          hint="JPEG, PNG or WebP, up to 15 MB. It's resized, and its location data is removed."
          upload={api.files.uploadPhoto}
          onUploaded={(file) => update((current) => ({ ...current, photoUrl: file.url }))}
          onRemove={value.photoUrl ? () => onChange({ ...value, photoUrl: '' }) : undefined}
          error={errors.photoUrl}
        >
          <ProfilePhoto url={value.photoUrl} />
        </FileUpload>
        <FileUpload
          label="Résumé"
          accept="application/pdf,.pdf"
          hint="A PDF, up to 20 MB. Visitors download it under its file name."
          upload={api.files.uploadResume}
          onUploaded={(file) => setResume(file.url)}
          onRemove={value.links.resumeUrl ? () => setResume('') : undefined}
          error={errors['links.resumeUrl']}
        >
          <p className="upload-current">
            {value.links.resumeUrl && isSafeUrl(value.links.resumeUrl) ? (
              <a href={value.links.resumeUrl} target="_blank" rel="noopener noreferrer">
                {fileNameOf(value.links.resumeUrl)}
              </a>
            ) : (
              <span className="muted">No résumé: the download button is hidden.</span>
            )}
          </p>
        </FileUpload>
      </div>
      <fieldset className="editor-item">
        <legend>Citizenship and residence</legend>
        <p className="muted editor-note">Labels under the photo, e.g. Romanian citizenship, EU citizenship, UK Settled Status.</p>
        <BulletsEditor itemName="label" value={value.statuses} onChange={(statuses) => onChange({ ...value, statuses })} errorFor={(i) => errors[`statuses[${i}]`]} listError={errors.statuses} />
      </fieldset>
      <div className="editor-grid">
        <TextField label="GitHub URL" type="url" value={value.links.gitHubUrl} onChange={setLink('gitHubUrl')} error={errors['links.gitHubUrl']} hint="Leave empty to hide it." />
        <TextField label="LinkedIn URL" type="url" value={value.links.linkedInUrl} onChange={setLink('linkedInUrl')} error={errors['links.linkedInUrl']} />
        <TextField label="Instagram URL" type="url" value={value.links.instagramUrl} onChange={setLink('instagramUrl')} error={errors['links.instagramUrl']} />
      </div>
    </div>
  )
}
