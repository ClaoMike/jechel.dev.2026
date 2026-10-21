import type { AboutLinks, ResumeContact, Status } from '../../../services/api'

export interface Profile {
  photoUrl: string
  statuses: Status[]
  links: AboutLinks
  /** The résumé's phone, email and headline: only the signed-in admin has them, and they're never on the public page. */
  contact?: ResumeContact
}

/** The profile's links on the card, in order; `icon` names the icon the view draws. */
export type ProfileLinkIcon = 'resume' | 'github' | 'leetcode' | 'linkedin' | 'instagram'

export interface ProfileLinkItem {
  href: string
  label: string
  icon: ProfileLinkIcon
  /** A file on this site to download (the résumé). */
  download: boolean
  /** Another site: opens in a new tab. */
  external: boolean
}
