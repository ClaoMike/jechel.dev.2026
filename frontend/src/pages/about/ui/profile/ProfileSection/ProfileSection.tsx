import { ErrorState } from '@/shared/ui/ErrorState'
import { isSafeUrl } from '@/shared/lib/format'
import { leetCodeProfileUrl } from '../../../lib/problemSolving'
import { EditableSection } from '../../section/EditableSection/EditableSection'
import { PrivateContact, type PrivateContactItem } from '../PrivateContact/PrivateContact'
import type { Profile, ProfileLinkItem } from '../../../lib/profile'
import { ProfileEditor } from '../ProfileEditor/ProfileEditor'
import { ProfileLinks } from '../ProfileLinks/ProfileLinks'
import { ProfilePhoto } from '../ProfilePhoto/ProfilePhoto'
import { StatusChips } from '../StatusChips/StatusChips'
import { strings } from '@/shared/i18n'

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
    { href: value.links.resumeUrl, label: strings.profileSection.downloadRSum, icon: 'resume', download: true },
    { href: value.links.gitHubUrl, label: 'GitHub', icon: 'github', download: false },
    { href: leetCodeUsername ? leetCodeProfileUrl(leetCodeUsername) : '', label: 'LeetCode', icon: 'leetcode', download: false },
    { href: value.links.linkedInUrl, label: 'LinkedIn', icon: 'linkedin', download: false },
    { href: value.links.instagramUrl, label: strings.profileSection.instagram, icon: 'instagram', download: false },
    { href: youTubeChannelUrl ?? '', label: 'YouTube', icon: 'youtube', download: false },
  ]
  const links = candidates.filter((link) => isSafeUrl(link.href)).map((link) => ({ ...link, external: !link.href.startsWith('/') }))
  const contact = value.contact
  const privateItems: PrivateContactItem[] = contact
    ? [
        { key: 'email' as const, label: strings.profileSection.email, value: contact.email.trim() },
        { key: 'phone' as const, label: strings.profileSection.phoneNumber, value: contact.phone.trim() },
      ].filter((item) => item.value.length > 0)
    : []

  return (
    <EditableSection
      title={strings.profileSection.photoLinks}
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
            {strings.profileSection.claudiuMihaiJechel}
          </p>
          {headline.trim() && <p className="profile-headline">{headline.trim()}</p>}
        </div>
        {/* Visitors see nothing without labels; the admin sees where they go. */}
        <StatusChips statuses={value.statuses} showEmpty={value.statuses.length === 0 && canEdit} />
        <ProfileLinks links={links} />
        {contact && <PrivateContact items={privateItems} emptyText={strings.profileSection.noEmailPhoneR} />}
        {onRetryContact && <ErrorState compact message={strings.profileSection.rSumSPhone} onRetry={onRetryContact} />}
      </div>
    </EditableSection>
  )
}
