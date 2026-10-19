import { Link } from 'react-router'
import { useTokenActionViewModel } from './UpdatesPages.viewModel'

/**
 * Where the link in the confirmation email lands (/updates/confirm?token=…): confirms the
 * subscription. A page rather than an API link, so mail scanners that open links don't confirm it.
 */
export function ConfirmSubscriptionPage() {
  const state = useTokenActionViewModel('confirm')

  return (
    <section className="card updates-page" aria-labelledby="updates-title">
      <h2 id="updates-title">Email updates</h2>
      {state.status === 'working' && <p>Confirming…</p>}
      {state.status === 'done' && (
        <p role="status">
          You're subscribed{state.email ? <> as <strong>{state.email}</strong></> : null}. You'll get an email when there's a new app or video.
        </p>
      )}
      {state.status === 'unknown' && <p role="alert">This link isn't valid any more. Subscribe again with "Get updates" at the top of the page.</p>}
      {state.status === 'error' && <p role="alert">That didn't work. Please try the link again later.</p>}
      <Link to="/" className="button button-secondary">
        See what's new
      </Link>
    </section>
  )
}

/** Where "Unsubscribe" in every update email lands (/updates/unsubscribe?token=…). */
export function UnsubscribePage() {
  const state = useTokenActionViewModel('unsubscribe')

  return (
    <section className="card updates-page" aria-labelledby="updates-title">
      <h2 id="updates-title">Email updates</h2>
      {state.status === 'working' && <p>Unsubscribing…</p>}
      {state.status === 'done' && <p role="status">You're unsubscribed: no more emails. Sorry to see you go.</p>}
      {state.status === 'unknown' && <p role="alert">This link isn't complete. Open it again from the email.</p>}
      {state.status === 'error' && <p role="alert">That didn't work. Please try the link again later.</p>}
      <Link to="/" className="button button-secondary">
        Back to the site
      </Link>
    </section>
  )
}
