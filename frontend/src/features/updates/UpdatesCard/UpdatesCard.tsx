import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { strings } from '../../../strings'

export type UpdatesMessage = { text: string; role?: 'status' | 'alert'; email?: string; after?: string }

/** The card the email links land on: "Email updates", what happened, and a way back to the site (`actions`: more buttons next to it). */
export function UpdatesCard({ message, back, actions }: { message: UpdatesMessage; back: string; actions?: ReactNode }) {
  return (
    <section className="card updates-page" aria-labelledby="updates-title">
      <h2 id="updates-title">{strings.updatesCard.emailUpdates}</h2>
      <p role={message.role}>
        {message.text}
        {message.email && <strong>{message.email}</strong>}
        {message.after}
      </p>
      <div className="updates-actions">
        <Link to="/" className="button button-secondary">
          {back}
        </Link>
        {actions}
      </div>
    </section>
  )
}
