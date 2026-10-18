import type { ReactNode } from 'react'
import { DownloadIcon, GitHubIcon, InstagramIcon, LeetCodeIcon, LinkedInIcon, PersonIcon } from '../../components/icons'
import { useId } from 'react'
import { api, type AboutLinks, type Status } from '../../services/api'
import { EditableSection } from './EditableSection'
import { FileUpload } from './FileUpload'
import { TextField, type EditorProps } from './fields'
import { fileNameOf, isSafeUrl } from './format'
import { Flag } from './Flag'
import { FLAG_CHOICES, flagName, guessFlag } from './flags'
import { AddButton, ItemControls } from './fields'
import { move, removeAt, replaceAt } from './list'
import { leetCodeProfileUrl } from './problemSolving'
import { RichText } from './RichText'
import { PHOTO_MAX_BYTES, RESUME_MAX_BYTES } from './uploadLimits'

export interface Profile {
  photoUrl: string
  statuses: Status[]
  links: AboutLinks
}

/**
 * The photo, then citizenship / residence labels, then the résumé / GitHub / LeetCode / LinkedIn /
 * Instagram links. The LeetCode username is set in the "Problem solving" section.
 */
export function ProfileSection({
  value,
  leetCodeUsername = '',
  canEdit,
  onSave,
}: {
  value: Profile
  leetCodeUsername?: string
  canEdit: boolean
  onSave: (value: Profile) => Promise<void>
}) {
  return (
    <EditableSection title="Photo and links" hideTitle errorKeys={['photoUrl', 'statuses', 'links']} className="profile-card" value={value} canEdit={canEdit} onSave={onSave} editor={ProfileEditor}>
      <div className="profile">
        <ProfilePhoto url={value.photoUrl} />
        <p className="profile-name">Claudiu Mihai Jechel</p>
        {value.statuses.length > 0 ? (
          <ul className="chips profile-statuses" aria-label="Citizenship and residence">
            {value.statuses.map((status, i) => (
              <li key={i} className="chip">
                <Flag code={status.flag} />
                <RichText text={status.text} />
              </li>
            ))}
          </ul>
        ) : (
          // Visitors see nothing; the admin sees where the labels go.
          canEdit && <p className="muted profile-statuses-empty">No citizenship or residence labels yet. Use Edit to add them.</p>
        )}
        <ul className="profile-links" aria-label="Links">
          <ProfileLink href={value.links.resumeUrl} icon={<DownloadIcon />} download>
            Download résumé
          </ProfileLink>
          <ProfileLink href={value.links.gitHubUrl} icon={<GitHubIcon />}>
            GitHub
          </ProfileLink>
          <ProfileLink href={leetCodeUsername ? leetCodeProfileUrl(leetCodeUsername) : ''} icon={<LeetCodeIcon />}>
            LeetCode
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
          accept="image/jpeg,image/png,image/webp,image/gif"
          maxBytes={PHOTO_MAX_BYTES}
          hint="JPEG, PNG, WebP or GIF, up to 15 MB. It's resized, and its location data is removed."
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
          maxBytes={RESUME_MAX_BYTES}
          hint="A PDF, up to 20 MB. Visitors download it under its file name. Generating a résumé (above) replaces it."
          upload={api.files.uploadResume}
          onUploaded={(file) => setResume(file.url)}
          onRemove={value.links.resumeUrl ? () => setResume('') : undefined}
          error={errors['links.resumeUrl']}
        >
          <p className="upload-current">
            {value.links.resumeUrl && isSafeUrl(value.links.resumeUrl) ? (
              <a href={value.links.resumeUrl} target="_blank" rel="noopener noreferrer">
                {value.links.resumeUrl.startsWith('/api/resume') ? 'The generated résumé (without your phone number)' : fileNameOf(value.links.resumeUrl)}
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

/** The labels under the photo: a flag and text each, reorderable. */
function StatusesEditor({ value, onChange, errors }: { value: Status[]; onChange: (value: Status[]) => void; errors: Record<string, string> }) {
  return (
    <div className="editor-list">
      {value.map((status, i) => (
        <StatusEditor
          key={i}
          index={i}
          count={value.length}
          status={status}
          error={errors[`statuses[${i}].text`] ?? errors[`statuses[${i}].flag`]}
          onChange={(next) => onChange(replaceAt(value, i, next))}
          onMove={(from, to) => onChange(move(value, from, to))}
          onRemove={() => onChange(removeAt(value, i))}
        />
      ))}
      {errors.statuses && <p className="field-error">{errors.statuses}</p>}
      <AddButton onClick={() => onChange([...value, { text: '', flag: '' }])}>Add label</AddButton>
    </div>
  )
}

interface StatusEditorProps {
  index: number
  count: number
  status: Status
  error?: string
  onChange: (status: Status) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}

function StatusEditor({ index, count, status, error, onChange, onMove, onRemove }: StatusEditorProps) {
  const flagId = useId()
  return (
    <div className="status-editor" role="group" aria-label={`Label ${index + 1}`}>
      <div className="field">
        <label htmlFor={flagId}>Flag</label>
        <div className="status-flag">
          <Flag code={status.flag} />
          <select id={flagId} className="select" value={status.flag} onChange={(e) => onChange({ ...status, flag: e.target.value })}>
            <option value="">No flag</option>
            {FLAG_CHOICES.map(({ code, name }) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
            {status.flag && !FLAG_CHOICES.some((c) => c.code === status.flag) && <option value={status.flag}>{flagName(status.flag)}</option>}
          </select>
        </div>
      </div>
      <TextField
        label="Label"
        value={status.text}
        required
        // Picks the flag the words suggest ("Romanian citizenship" → Romania) until one is chosen by hand.
        onChange={(text) => onChange({ text, flag: status.flag || guessFlag(text) })}
        error={error}
      />
      <ItemControls name={`label ${index + 1}`} index={index} count={count} onMove={onMove} onRemove={onRemove} />
    </div>
  )
}
