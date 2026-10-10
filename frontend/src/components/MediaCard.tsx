import { useId, type ReactNode } from 'react'

export interface MediaCardProps {
  href: string
  imageUrl: string
  title: string
  /** Cut off after three lines. */
  description?: string
  /** A small line under the title, e.g. a date. */
  meta?: ReactNode
  /** Opens the link in a new tab (default). */
  newTab?: boolean
}

/** A picture with a title and a short description; the whole card is one link. */
export function MediaCard({ href, imageUrl, title, description, meta, newTab = true }: MediaCardProps) {
  const descriptionId = useId()
  return (
    <a
      className="media-card"
      href={href}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noopener noreferrer' : undefined}
      aria-label={newTab ? `${title} (opens in a new tab)` : title}
      aria-describedby={description ? descriptionId : undefined}
    >
      <img className="media-card-image" src={imageUrl} alt="" loading="lazy" />
      <span className="media-card-body">
        <span className="media-card-title">{title}</span>
        {meta && <span className="media-card-meta">{meta}</span>}
        {description && (
          <span className="media-card-description" id={descriptionId}>
            {description}
          </span>
        )}
      </span>
    </a>
  )
}
