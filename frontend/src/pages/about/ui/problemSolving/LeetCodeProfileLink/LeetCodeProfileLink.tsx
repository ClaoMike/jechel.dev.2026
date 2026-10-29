import { LeetCodeIcon } from '@/shared/ui/icons'
import { strings } from '@/shared/i18n'

/** "LeetCode @username", to the profile on LeetCode (a new tab). */
export function LeetCodeProfileLink({ href, username }: { href: string; username: string }) {
  return (
    <a className="leetcode-profile" href={href} target="_blank" rel="noopener noreferrer">
      <LeetCodeIcon size={20} />
      {strings.leetCodeProfileLink.leetcode}
      <span className="muted">@{username}</span>
    </a>
  )
}
