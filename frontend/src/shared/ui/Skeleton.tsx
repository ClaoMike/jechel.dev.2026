import type { CSSProperties, ReactNode } from 'react'
import { strings } from '../i18n'

/**
 * Placeholders shaped like the content that's on its way (no spinners). Each is a shimmering block;
 * <Loading> wraps them so screen readers hear "Loading …" once instead of a pile of empty boxes.
 */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 6,
  className = '',
  style,
}: {
  width?: number | string
  height?: number | string
  radius?: number | string
  className?: string
  style?: CSSProperties
}) {
  return <span className={`skeleton ${className}`} style={{ width, height, borderRadius: radius, ...style }} />
}

/** A live region for a loading area: `label` is read out (and found by tests); the placeholders are hidden from screen readers. */
export function Loading({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`loading ${className}`} role="status" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <div className="loading-shapes" aria-hidden="true">
        {children}
      </div>
    </div>
  )
}

/** Lines of text, the last one shorter, like a paragraph. */
export function SkeletonText({ lines = 3, lineHeight = 14 }: { lines?: number; lineHeight?: number }) {
  const widths = ['100%', '94%', '97%', '88%', '92%']
  return (
    <div className="skeleton-text">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={lineHeight} width={i === lines - 1 && lines > 1 ? '62%' : widths[i % widths.length]} />
      ))}
    </div>
  )
}

/** A card with a heading and a paragraph, like an About Me section or a settings card. */
export function SkeletonCard({ lines = 3, heading = true }: { lines?: number; heading?: boolean }) {
  return (
    <div className="card skeleton-card">
      {heading && <Skeleton width="38%" height={22} />}
      <SkeletonText lines={lines} />
    </div>
  )
}

/** Tiles like MediaCard's (Apps, YouTube): a 16:9 picture, a title, a line and a short description. */
export function SkeletonMediaGrid({ count = 6 }: { count?: number }) {
  return (
    <ul className="paged-grid-items skeleton-grid">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="media-card skeleton-media-card">
          <Skeleton height="auto" radius={0} className="skeleton-media" />
          <div className="skeleton-media-body">
            <Skeleton width="72%" height={18} />
            <Skeleton width="40%" height={12} />
            <SkeletonText lines={2} lineHeight={12} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Table rows (the inbox, visits, subscribers, donations): a header and `rows` rows of `columns` cells. */
export function SkeletonTable({ rows = 5, columns = 3 }: { rows?: number; columns?: number }) {
  return (
    <div className="skeleton-table">
      {Array.from({ length: rows + 1 }, (_, r) => (
        <div key={r} className="skeleton-row" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} height={r === 0 ? 10 : 14} width={r === 0 ? '45%' : `${60 + ((r * 7 + c * 13) % 35)}%`} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Rows of a list, each a short label and a line (the update emails, settings, a visit's steps). */
export function SkeletonList({ rows = 4, pill = false }: { rows?: number; pill?: boolean }) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-list-row">
          {pill && <Skeleton width={56} height={22} radius={999} />}
          <Skeleton width={`${50 + ((i * 17) % 40)}%`} height={16} />
        </div>
      ))}
    </div>
  )
}

/** Rounded labels in a row (chips, checkboxes). */
export function SkeletonChips({ count = 4 }: { count?: number }) {
  return (
    <div className="skeleton-chips">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} width={70 + ((i * 29) % 60)} height={28} radius={999} />
      ))}
    </div>
  )
}

/** A page whose content isn't known yet (e.g. while the session is checked): two cards. */
export function PageSkeleton({ label = strings.common.loading }: { label?: string }) {
  return (
    <Loading label={label}>
      <SkeletonCard lines={4} />
      <SkeletonCard lines={3} />
    </Loading>
  )
}
