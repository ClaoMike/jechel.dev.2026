import { useId, type ReactNode } from 'react'
import { FittedImage } from './FittedImage'
import { ImageIcon } from './icons'

export interface MediaCardProps {
  /** A link to open (in a new tab by default)... */
  href?: string
  /** ...or something to do instead, e.g. open a popup. */
  onClick?: () => void
  /** Empty: a placeholder picture. */
  imageUrl?: string
  title: string
  /** Cut off after three lines. */
  description?: string
  /** A small line under the title, e.g. a date. */
  meta?: ReactNode
  /** Opens `href` in a new tab (default). */
  newTab?: boolean
}

/** A picture with a title and a short description; the whole card is one link or button. */
export function MediaCard({ href, onClick, imageUrl, title, description, meta, newTab = true }: MediaCardProps) {
  const descriptionId = useId()
  const content = (
    <>
      {imageUrl ? (
        <FittedImage className="media-card-image" src={imageUrl} alt="" />
      ) : (
        <span className="media-card-image media-card-placeholder" aria-hidden="true">
          <ImageIcon size={40} />
        </span>
      )}
      <span className="media-card-body">
        <span className="media-card-title">{title}</span>
        {meta && <span className="media-card-meta">{meta}</span>}
        {description && (
          <span className="media-card-description" id={descriptionId}>
            {description}
          </span>
        )}
      </span>
    </>
  )
  const describedBy = description ? descriptionId : undefined

  if (href === undefined)
    return (
      <button type="button" className="media-card" onClick={onClick} aria-label={title} aria-describedby={describedBy}>
        {content}
      </button>
    )
  return (
    <a
      className="media-card"
      href={href}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noopener noreferrer' : undefined}
      aria-label={newTab ? `${title} (opens in a new tab)` : title}
      aria-describedby={describedBy}
    >
      {content}
    </a>
  )
}
