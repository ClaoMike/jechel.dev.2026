import type { AboutLinks, ResumeContact, Status } from '@/shared/api'

export interface Profile {
  photoUrl: string
  statuses: Status[]
  links: AboutLinks
  /** The résumé's phone, email and headline: only the signed-in admin has them. Of these, only the headline is public (shown under the name). */
  contact?: ResumeContact
}

/** The profile's links on the card, in order; `icon` names the icon the view draws. */
export type ProfileLinkIcon = 'resume' | 'github' | 'leetcode' | 'linkedin' | 'instagram' | 'youtube'

export interface ProfileLinkItem {
  href: string
  label: string
  icon: ProfileLinkIcon
  /** A file on this site to download (the résumé). */
  download: boolean
  /** Another site: opens in a new tab. */
  external: boolean
}
