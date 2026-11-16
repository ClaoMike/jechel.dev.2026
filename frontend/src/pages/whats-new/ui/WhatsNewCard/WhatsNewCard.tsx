import type { ReactNode } from 'react'

export interface WhatsNewCardProps {
  /** "New app" or "New video". */
  kind: string
  /** When, as shown ("Oct 11, 2026") and machine-readable. */
  date: string
  dateTime: string
  title: string
  /** Shown under the title, e.g. the app's categories. */
  labels?: ReactNode
  /** The item itself. */
  children: ReactNode
}

/** The newest app or video, as a card: what it is and when, its title, then the item. */
export function WhatsNewCard({ kind, date, dateTime, title, labels, children }: WhatsNewCardProps) {
  return (
    <article className="card whats-new-item" aria-labelledby="whats-new-item-title">
      <header className="whats-new-header">
        <p className="whats-new-kind">
          {kind} · <time dateTime={dateTime}>{date}</time>
        </p>
        <h3 id="whats-new-item-title">{title}</h3>
        {labels}
      </header>
      {children}
    </article>
  )
}
