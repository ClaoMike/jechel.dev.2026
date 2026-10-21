import { Link } from 'react-router'

export type UpdatesMessage = { text: string; role?: 'status' | 'alert'; email?: string; after?: string }

/** The card the email links land on: "Email updates", what happened, and a way back to the site. */
export function UpdatesCard({ message, back }: { message: UpdatesMessage; back: string }) {
  return (
    <section className="card updates-page" aria-labelledby="updates-title">
      <h2 id="updates-title">Email updates</h2>
      <p role={message.role}>
        {message.text}
        {message.email && <strong>{message.email}</strong>}
        {message.after}
      </p>
      <Link to="/" className="button button-secondary">
        {back}
      </Link>
    </section>
  )
}
