import { useId, useRef, useState, type ReactNode } from 'react'
import { DownloadIcon, GitHubIcon, InstagramIcon, LinkedInIcon, PersonIcon, TrashIcon, UploadIcon } from '../../components/icons'
import { ApiError, api, type AboutLinks, type UploadedFile } from '../../services/api'
import { EditableSection } from './EditableSection'
import { TextField, type EditorProps } from './fields'
import { fileNameOf, isSafeUrl } from './format'

export interface Profile {
  photoUrl: string
  links: AboutLinks
}

/** The photo and the résumé / GitHub / LinkedIn / Instagram links. */
export function ProfileSection({ value, canEdit, onSave }: { value: Profile; canEdit: boolean; onSave: (value: Profile) => Promise<void> }) {
  return (
    <EditableSection title="Photo and links" hideTitle className="profile-card" value={value} canEdit={canEdit} onSave={onSave} editor={ProfileEditor}>
      <div className="profile">
        <ProfilePhoto url={value.photoUrl} />
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
          hint="A PDF, up to 10 MB. Visitors download it under its file name."
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
      <div className="editor-grid">
        <TextField label="GitHub URL" type="url" value={value.links.gitHubUrl} onChange={setLink('gitHubUrl')} error={errors['links.gitHubUrl']} hint="Leave empty to hide it." />
        <TextField label="LinkedIn URL" type="url" value={value.links.linkedInUrl} onChange={setLink('linkedInUrl')} error={errors['links.linkedInUrl']} />
        <TextField label="Instagram URL" type="url" value={value.links.instagramUrl} onChange={setLink('instagramUrl')} error={errors['links.instagramUrl']} />
      </div>
    </div>
  )
}

interface FileUploadProps {
  label: string
  accept: string
  hint: string
  upload: (file: File) => Promise<UploadedFile>
  onUploaded: (file: UploadedFile) => void
  /** Absent when there's nothing to remove. */
  onRemove?: () => void
  error?: string
  /** What's there now: the photo, or the résumé's name. */
  children: ReactNode
}

/**
 * Upload / Replace and Remove buttons for one file. The file is uploaded straight away, but
 * the page only uses it once the section is saved.
 */
function FileUpload({ label, accept, hint, upload, onUploaded, onRemove, error, children }: FileUploadProps) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<{ state: 'idle' } | { state: 'uploading' } | { state: 'failed'; message: string }>({ state: 'idle' })
  const message = status.state === 'failed' ? status.message : error

  async function handleFile(file: File | undefined) {
    if (!file) return
    setStatus({ state: 'uploading' })
    try {
      onUploaded(await upload(file))
      setStatus({ state: 'idle' })
    } catch (e) {
      const reason = e instanceof ApiError && e.validationErrors?.file?.[0]
      const expired = e instanceof ApiError && e.status === 401
      setStatus({ state: 'failed', message: reason || (expired ? 'Your session has ended. Sign in again, then upload.' : "Couldn't upload. Please try again.") })
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  return (
    <fieldset className="upload" aria-describedby={`${id}-hint${message ? ` ${id}-error` : ''}`}>
      <legend className="field-label">{label}</legend>
      {children}
      <div className="upload-actions">
        <input ref={input} id={id} type="file" accept={accept} className="visually-hidden" tabIndex={-1} onChange={(e) => void handleFile(e.target.files?.[0])} aria-label={`${label} file`} />
        <button type="button" className="button button-secondary button-small" disabled={status.state === 'uploading'} onClick={() => input.current?.click()}>
          <UploadIcon size={16} />
          {status.state === 'uploading' ? 'Uploading…' : onRemove ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
        </button>
        {onRemove && (
          <button type="button" className="button button-secondary button-small" disabled={status.state === 'uploading'} onClick={onRemove}>
            <TrashIcon size={16} />
            Remove {label.toLowerCase()}
          </button>
        )}
      </div>
      <p className="field-hint" id={`${id}-hint`}>
        {hint}
      </p>
      {message && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {message}
        </p>
      )}
    </fieldset>
  )
}
