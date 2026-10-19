import { LeetCodeIcon } from '../../../../components/icons/icons'

/** "LeetCode @username", to the profile on LeetCode (a new tab). */
export function LeetCodeProfileLink({ href, username }: { href: string; username: string }) {
  return (
    <a className="leetcode-profile" href={href} target="_blank" rel="noopener noreferrer">
      <LeetCodeIcon size={20} />
      LeetCode
      <span className="muted">@{username}</span>
    </a>
  )
}
