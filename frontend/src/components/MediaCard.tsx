import type { ReactNode } from 'react'
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

/**
 * A picture with a title and a short description. The title is the link (or button), stretched over
 * the whole card, so the card is clickable anywhere while its name stays the title (plus "opens in a
 * new tab"); the date and description are read as the card's text, not crammed into the link's name.
 */
export function MediaCard({ href, onClick, imageUrl, title, description, meta, newTab = true }: MediaCardProps) {
  const action =
    href === undefined ? (
      <button type="button" className="media-card-action" onClick={onClick}>
        {title}
      </button>
    ) : (
      <a className="media-card-action" href={href} target={newTab ? '_blank' : undefined} rel={newTab ? 'noopener noreferrer' : undefined}>
        {title}
        {/* The space outside the hidden text: some screen readers drop a leading space inside it. */}
        {newTab && ' '}
        {newTab && <span className="visually-hidden">(opens in a new tab)</span>}
      </a>
    )

  return (
    <div className="media-card">
      {imageUrl ? (
        <FittedImage className="media-card-image" src={imageUrl} alt="" />
      ) : (
        <span className="media-card-image media-card-placeholder" aria-hidden="true">
          <ImageIcon size={40} />
        </span>
      )}
      <div className="media-card-body">
        <h3 className="media-card-title">{action}</h3>
        {meta && <span className="media-card-meta">{meta}</span>}
        {description && <p className="media-card-description">{description}</p>}
      </div>
    </div>
  )
}
