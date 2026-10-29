import type { ReactNode } from 'react'
import { DownloadIcon, GitHubIcon, InstagramIcon, LeetCodeIcon, LinkedInIcon, YouTubeIcon } from '@/shared/ui/icons'
import type { ProfileLinkIcon, ProfileLinkItem } from '../../../lib/profile'
import { strings } from '@/shared/i18n'

const ICONS: Record<ProfileLinkIcon, ReactNode> = {
  resume: <DownloadIcon />,
  github: <GitHubIcon />,
  leetcode: <LeetCodeIcon />,
  linkedin: <LinkedInIcon />,
  instagram: <InstagramIcon />,
  youtube: <YouTubeIcon />,
}

/** The profile's links as buttons: the résumé downloads, the others open in a new tab. */
export function ProfileLinks({ links }: { links: ProfileLinkItem[] }) {
  return (
    <ul className="profile-links" aria-label={strings.profileLinks.links}>
      {links.map((link) => (
        <li key={link.icon}>
          <a
            className="button button-secondary profile-link"
            href={link.href}
            download={link.download && !link.external ? '' : undefined}
            target={link.external ? '_blank' : undefined}
            rel={link.external ? 'noopener noreferrer' : undefined}
          >
            {ICONS[link.icon]}
            {link.label}
          </a>
        </li>
      ))}
    </ul>
  )
}
