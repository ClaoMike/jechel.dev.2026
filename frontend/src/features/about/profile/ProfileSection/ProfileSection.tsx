import { ErrorState } from '../../../../components/ErrorState/ErrorState'
import { isSafeUrl } from '../../format'
import { leetCodeProfileUrl } from '../../problemSolving/problemSolving'
import { EditableSection } from '../../section/EditableSection/EditableSection'
import { PrivateContact, type PrivateContactItem } from '../PrivateContact/PrivateContact'
import type { Profile, ProfileLinkItem } from '../profile'
import { ProfileEditor } from '../ProfileEditor/ProfileEditor'
import { ProfileLinks } from '../ProfileLinks/ProfileLinks'
import { ProfilePhoto } from '../ProfilePhoto/ProfilePhoto'
import { StatusChips } from '../StatusChips/StatusChips'

export interface ProfileSectionProps {
  value: Profile
  /** Public, under the name: the résumé's headline ("" hides it). */
  headline?: string
  leetCodeUsername?: string
  /** My YouTube channel's page (Settings → YouTube), when one is set. */
  youTubeChannelUrl?: string | null
  canEdit: boolean
  onSave: (value: Profile) => Promise<void>
  /** Set when the résumé's private details couldn't be loaded (admin only). */
  onRetryContact?: () => void
}

/**
 * The photo, the name and headline, then citizenship / residence labels, then the résumé / GitHub /
 * LeetCode / LinkedIn / Instagram links (empty or unsafe ones are left out). The LeetCode username is set in the "Problem
 * solving" section. The résumé is generated (the panel above); for the admin, this section also holds its private
 * contact details.
 */
export function ProfileSection({ value, headline = '', leetCodeUsername = '', youTubeChannelUrl, canEdit, onSave, onRetryContact }: ProfileSectionProps) {
  const candidates: Omit<ProfileLinkItem, 'external'>[] = [
    { href: value.links.resumeUrl, label: 'Download résumé', icon: 'resume', download: true },
    { href: value.links.gitHubUrl, label: 'GitHub', icon: 'github', download: false },
    { href: leetCodeUsername ? leetCodeProfileUrl(leetCodeUsername) : '', label: 'LeetCode', icon: 'leetcode', download: false },
    { href: value.links.linkedInUrl, label: 'LinkedIn', icon: 'linkedin', download: false },
    { href: value.links.instagramUrl, label: 'Instagram', icon: 'instagram', download: false },
    { href: youTubeChannelUrl ?? '', label: 'YouTube', icon: 'youtube', download: false },
  ]
  const links = candidates.filter((link) => isSafeUrl(link.href)).map((link) => ({ ...link, external: !link.href.startsWith('/') }))
  const contact = value.contact
  const privateItems: PrivateContactItem[] = contact
    ? [
        { key: 'email' as const, label: 'email', value: contact.email.trim() },
        { key: 'phone' as const, label: 'phone number', value: contact.phone.trim() },
      ].filter((item) => item.value.length > 0)
    : []

  return (
    <EditableSection
      title="Photo and links"
      hideTitle
      errorKeys={['photoUrl', 'statuses', 'links', 'contact']}
      className="profile-card"
      value={value}
      canEdit={canEdit}
      onSave={onSave}
      editor={ProfileEditor}
    >
      <div className="profile">
        <ProfilePhoto url={isSafeUrl(value.photoUrl) ? value.photoUrl : null} />
        <div className="profile-heading">
          <p className="profile-name" translate="no">
            Claudiu Mihai Jechel
          </p>
          {headline.trim() && <p className="profile-headline">{headline.trim()}</p>}
        </div>
        {/* Visitors see nothing without labels; the admin sees where they go. */}
        <StatusChips statuses={value.statuses} showEmpty={value.statuses.length === 0 && canEdit} />
        <ProfileLinks links={links} />
        {contact && <PrivateContact items={privateItems} emptyText="no email or phone for the résumé yet. Use Edit to add them." />}
        {onRetryContact && <ErrorState compact message="Your résumé's phone, email and headline couldn't be loaded." onRetry={onRetryContact} />}
      </div>
    </EditableSection>
  )
}
