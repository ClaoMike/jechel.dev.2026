import type { ReactNode } from 'react'
import { CodeIcon, DownloadIcon, InstagramIcon, LinkedInIcon, PersonIcon } from '../../components/icons'
import type { AboutLinks } from '../../services/api'
import { EditableSection } from './EditableSection'
import { TextField, type EditorProps } from './fields'
import { isSafeUrl } from './format'

export interface Profile {
  photoUrl: string
  links: AboutLinks
}

const URL_HINT = 'A full link (https://…) or a path on this site (/resume.pdf). Leave empty to hide it.'

/** The photo and the résumé / GitHub / LinkedIn / Instagram links. */
export function ProfileSection({ value, canEdit, onSave }: { value: Profile; canEdit: boolean; onSave: (value: Profile) => Promise<void> }) {
  return (
    <EditableSection title="Photo and links" hideTitle className="profile-card" value={value} canEdit={canEdit} onSave={onSave} editor={ProfileEditor}>
      <div className="profile">
        {isSafeUrl(value.photoUrl) ? (
          <img className="profile-photo" src={value.photoUrl} alt="Claudiu Jechel" />
        ) : (
          <div className="profile-photo profile-photo-placeholder" role="img" aria-label="Photo placeholder">
            <PersonIcon size={64} />
          </div>
        )}
        <ul className="profile-links" aria-label="Links">
          <ProfileLink href={value.links.resumeUrl} icon={<DownloadIcon />} download>
            Download résumé
          </ProfileLink>
          <ProfileLink href={value.links.gitHubUrl} icon={<CodeIcon />}>
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

function ProfileEditor({ value, onChange, errors }: EditorProps<Profile>) {
  const setLink = (key: keyof AboutLinks) => (url: string) => onChange({ ...value, links: { ...value.links, [key]: url } })

  return (
    <div className="editor-grid">
      <TextField label="Photo URL" type="url" value={value.photoUrl} onChange={(photoUrl) => onChange({ ...value, photoUrl })} error={errors.photoUrl} hint="Leave empty for the placeholder." />
      <TextField label="Résumé URL" type="url" value={value.links.resumeUrl} onChange={setLink('resumeUrl')} error={errors['links.resumeUrl']} hint={URL_HINT} />
      <TextField label="GitHub URL" type="url" value={value.links.gitHubUrl} onChange={setLink('gitHubUrl')} error={errors['links.gitHubUrl']} />
      <TextField label="LinkedIn URL" type="url" value={value.links.linkedInUrl} onChange={setLink('linkedInUrl')} error={errors['links.linkedInUrl']} />
      <TextField label="Instagram URL" type="url" value={value.links.instagramUrl} onChange={setLink('instagramUrl')} error={errors['links.instagramUrl']} />
    </div>
  )
}
