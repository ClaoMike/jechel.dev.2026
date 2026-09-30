/** Small pieces shared by the History tab: lane colours, avatars, ref and pull request badges. */
import type { GitPullRequest } from '../../../src/shared/git-types.ts'
import { hashString } from '../../../src/shared/rng.ts'
import type { Theme } from '../model/store.ts'
import { Icon } from '../ui/icons.tsx'
import { initials, type RefBadge } from './model.ts'

const LANES_DARK = ['#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#fb923c', '#60a5fa', '#f87171', '#2dd4bf', '#c084fc', '#a3e635', '#e879f9']
const LANES_LIGHT = ['#0284c7', '#7c3aed', '#db2777', '#059669', '#b45309', '#ea580c', '#2563eb', '#dc2626', '#0d9488', '#9333ea', '#4d7c0f', '#c026d3']

export function laneColor(index: number, theme: Theme): string {
  const palette = theme === 'light' ? LANES_LIGHT : LANES_DARK
  return palette[((index % palette.length) + palette.length) % palette.length]
}

export function Avatar({ name, size = 18 }: { name: string; size?: number }) {
  const hue = hashString(name) % 360
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46), background: `hsl(${hue} 55% 46%)` }}
    >
      {initials(name)}
    </span>
  )
}

export function RefBadgeView({ badge, color, compact = false }: { badge: RefBadge; color: string; compact?: boolean }) {
  const title = [
    badge.head ? 'HEAD (checked out)' : '',
    ...badge.refs.map((r) => (r.type === 'tag' ? `tag ${r.name}${r.message ? ` — ${r.message}` : ''}` : r.type === 'remote' ? `remote branch ${r.name}` : `local branch ${r.name}`)),
  ]
    .filter(Boolean)
    .join('\n')
  if (badge.type === 'tag') {
    return (
      <span className="ref-badge tag" title={title}>
        <Icon name="tag" size={11} />
        <span className="ref-name">{badge.label}</span>
      </span>
    )
  }
  return (
    <span
      className={`ref-badge branch${badge.head ? ' head' : ''}${badge.local ? '' : ' remote-only'}`}
      style={{ ['--badge' as string]: color }}
      title={title}
    >
      {badge.head && <span className="head-dot" aria-label="HEAD" />}
      {!badge.local && <CloudIcon />}
      <span className="ref-name">{badge.label}</span>
      {badge.local && badge.remotes.length > 0 && !compact && (
        <span className="ref-sync" title={`also ${badge.remotes.map((r) => `${r}/${badge.label}`).join(', ')}`}>
          <CloudIcon />
        </span>
      )}
    </span>
  )
}

export function PrBadge({ pr, withTitle = false }: { pr: GitPullRequest; withTitle?: boolean }) {
  const state = pr.draft && pr.state === 'open' ? 'draft' : pr.state
  return (
    <span className={`pr-badge ${state}`} title={`Pull request #${pr.number} (${state}): ${pr.title}`}>
      <Icon name="pr" size={11} />#{pr.number}
      {withTitle && <span className="pr-title">{pr.title}</span>}
    </span>
  )
}

export function CloudIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 15.5h8.2a3.3 3.3 0 0 0 .4-6.6A4.8 4.8 0 0 0 5.4 8 3.8 3.8 0 0 0 6 15.5z" />
    </svg>
  )
}

export const PR_STATE_LABEL: Record<string, string> = { open: 'Open', draft: 'Draft', merged: 'Merged', closed: 'Closed' }

export function prState(pr: GitPullRequest): 'open' | 'draft' | 'merged' | 'closed' {
  return pr.draft && pr.state === 'open' ? 'draft' : pr.state
}

export const FILE_STATUS: Record<string, { label: string; className: string }> = {
  A: { label: 'added', className: 'added' },
  M: { label: 'modified', className: 'modified' },
  D: { label: 'deleted', className: 'deleted' },
  R: { label: 'renamed', className: 'renamed' },
  C: { label: 'copied', className: 'renamed' },
  T: { label: 'type changed', className: 'modified' },
  U: { label: 'unmerged', className: 'deleted' },
  X: { label: 'unknown', className: 'modified' },
}

/** A porcelain status code ("M ", " M", "??", "UU"…) as one letter and a description. */
export function worktreeStatus(code: string): { letter: string; label: string; className: string } {
  if (code === '??') return { letter: 'U', label: 'untracked', className: 'added' }
  if (code.includes('U') || code === 'AA' || code === 'DD') return { letter: '!', label: 'conflict', className: 'deleted' }
  const staged = code[0] !== ' '
  const letter = (staged ? code[0] : code[1]) ?? 'M'
  const base = FILE_STATUS[letter]?.label ?? 'changed'
  const both = staged && code[1] !== ' '
  return { letter, label: both ? `${base} (partly staged)` : staged ? `${base} (staged)` : base, className: FILE_STATUS[letter]?.className ?? 'modified' }
}
