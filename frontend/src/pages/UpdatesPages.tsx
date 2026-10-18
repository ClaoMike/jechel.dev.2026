import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ApiError, api } from '../services/api'

type State = { status: 'working' } | { status: 'done'; email?: string } | { status: 'unknown' } | { status: 'error' }

/**
 * Where the link in the confirmation email lands (/updates/confirm?token=…): confirms the
 * subscription. A page rather than an API link, so mail scanners that open links don't confirm it.
 */
export function ConfirmSubscriptionPage() {
  const token = useSearchParams()[0].get('token') ?? ''
  const state = useTokenAction('confirm', token)

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
  const token = useSearchParams()[0].get('token') ?? ''
  const state = useTokenAction('unsubscribe', token)

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

/** Confirms or unsubscribes once per token (both are idempotent); a missing token or a 404 is "unknown". */
function useTokenAction(action: 'confirm' | 'unsubscribe', token: string): State {
  const [state, setState] = useState<State>(token ? { status: 'working' } : { status: 'unknown' })

  useEffect(() => {
    if (!token) return
    let current = true
    const run = action === 'confirm' ? api.updates.confirm(token).then((email) => ({ email })) : api.updates.unsubscribe(token).then(() => ({}))
    run
      .then((result) => current && setState({ status: 'done', ...result }))
      .catch((error: unknown) => current && setState(error instanceof ApiError && error.status === 404 ? { status: 'unknown' } : { status: 'error' }))
    return () => {
      current = false
    }
  }, [action, token])

  return state
}
