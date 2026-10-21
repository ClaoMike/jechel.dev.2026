import { isSafeUrl } from '../../format'
import { leetCodeProfileUrl } from '../../problemSolving/problemSolving'
import type { Profile, ProfileLinkItem } from '../profile'

export interface ProfileSectionProps {
  value: Profile
  leetCodeUsername?: string
  canEdit: boolean
  onSave: (value: Profile) => Promise<void>
  /** Set when the résumé's private details couldn't be loaded (admin only). */
  onRetryContact?: () => void
}

/** The links worth showing (empty or unsafe ones are left out), the photo, and the admin's private line. */
export function useProfileSectionViewModel({ value, leetCodeUsername = '', canEdit, onRetryContact }: ProfileSectionProps) {
  const candidates: Omit<ProfileLinkItem, 'external'>[] = [
    { href: value.links.resumeUrl, label: 'Download résumé', icon: 'resume', download: true },
    { href: value.links.gitHubUrl, label: 'GitHub', icon: 'github', download: false },
    { href: leetCodeUsername ? leetCodeProfileUrl(leetCodeUsername) : '', label: 'LeetCode', icon: 'leetcode', download: false },
    { href: value.links.linkedInUrl, label: 'LinkedIn', icon: 'linkedin', download: false },
    { href: value.links.instagramUrl, label: 'Instagram', icon: 'instagram', download: false },
  ]
  const contact = value.contact
  const parts = contact ? [contact.headline, contact.email, contact.phone].filter(Boolean) : []

  return {
    photoUrl: isSafeUrl(value.photoUrl) ? value.photoUrl : null,
    statuses: value.statuses,
    // Visitors see nothing without labels; the admin sees where they go.
    showNoStatuses: value.statuses.length === 0 && canEdit,
    links: candidates.filter((link) => isSafeUrl(link.href)).map((link) => ({ ...link, external: !link.href.startsWith('/') })),
    privateContact: contact ? (parts.length > 0 ? parts.join(' · ') : 'no headline, email or phone for the résumé yet. Use Edit to add them.') : null,
    contactError: onRetryContact ? { message: "Your résumé's phone, email and headline couldn't be loaded.", retry: onRetryContact } : null,
  }
}
