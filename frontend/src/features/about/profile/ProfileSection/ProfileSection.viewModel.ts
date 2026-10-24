import { isSafeUrl } from '../../format'
import { leetCodeProfileUrl } from '../../problemSolving/problemSolving'
import type { PrivateContactItem } from '../PrivateContact/PrivateContact'
import type { Profile, ProfileLinkItem } from '../profile'

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

/** The links worth showing (empty or unsafe ones are left out), the photo, the headline, and the admin's private email and phone. */
export function useProfileSectionViewModel({ value, headline = '', leetCodeUsername = '', youTubeChannelUrl, canEdit, onRetryContact }: ProfileSectionProps) {
  const candidates: Omit<ProfileLinkItem, 'external'>[] = [
    { href: value.links.resumeUrl, label: 'Download résumé', icon: 'resume', download: true },
    { href: value.links.gitHubUrl, label: 'GitHub', icon: 'github', download: false },
    { href: leetCodeUsername ? leetCodeProfileUrl(leetCodeUsername) : '', label: 'LeetCode', icon: 'leetcode', download: false },
    { href: value.links.linkedInUrl, label: 'LinkedIn', icon: 'linkedin', download: false },
    { href: value.links.instagramUrl, label: 'Instagram', icon: 'instagram', download: false },
    { href: youTubeChannelUrl ?? '', label: 'YouTube', icon: 'youtube', download: false },
  ]
  const contact = value.contact
  const privateItems: PrivateContactItem[] = contact
    ? [
        { key: 'email' as const, label: 'email', value: contact.email.trim() },
        { key: 'phone' as const, label: 'phone number', value: contact.phone.trim() },
      ].filter((item) => item.value.length > 0)
    : []

  return {
    photoUrl: isSafeUrl(value.photoUrl) ? value.photoUrl : null,
    headline: headline.trim() || null,
    statuses: value.statuses,
    // Visitors see nothing without labels; the admin sees where they go.
    showNoStatuses: value.statuses.length === 0 && canEdit,
    links: candidates.filter((link) => isSafeUrl(link.href)).map((link) => ({ ...link, external: !link.href.startsWith('/') })),
    privateContact: contact ? { items: privateItems, emptyText: 'no email or phone for the résumé yet. Use Edit to add them.' } : null,
    contactError: onRetryContact ? { message: "Your résumé's phone, email and headline couldn't be loaded.", retry: onRetryContact } : null,
  }
}
