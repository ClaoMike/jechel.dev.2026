import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../store'
import { checkSession, refreshSession, sessionCheckedAt, signedOutElsewhere } from '../store/authSlice'
import { listenToOtherTabs } from './authChannel'

/** The API extends a session at most once a minute, so pinging more often is pointless. */
export const ACTIVITY_REFRESH_MS = 60_000
/** Re-check just after the session should have ended, to absorb network latency. */
const EXPIRY_GRACE_MS = 2_000
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'mousemove'] as const

/**
 * Keeps the store's session up to date, for the whole app (App's view model): checks it when the page
 * opens; then, while signed in, activity in the page extends it, and without activity it signs out in
 * the UI when it ends. Signing in or out in another tab of this browser shows here at once.
 */
export function useSessionKeeper() {
  const dispatch = useAppDispatch()
  const user = useAppSelector((state) => (state.auth.status === 'authenticated' ? state.auth.user : null))

  useEffect(() => {
    const check = dispatch(checkSession())
    return () => check.abort()
  }, [dispatch])

  // Another tab signed out (the shared cookie is gone): so is this one. Another signed in: check.
  const signedIn = user !== null
  useEffect(
    () =>
      listenToOtherTabs((message) => {
        if (message === 'signedOut') dispatch(signedOutElsewhere())
        else if (!signedIn) void dispatch(refreshSession())
      }),
    [signedIn, dispatch],
  )

  // Re-armed after every refresh, since each one returns a fresh user object and expiry.
  useEffect(() => {
    if (!user) return

    const onActivity = () => {
      if (Date.now() - sessionCheckedAt() >= ACTIVITY_REFRESH_MS) void dispatch(refreshSession())
    }
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onActivity, { passive: true })

    // This check can't extend the session: by the time it runs, the server has already ended it
    // (unless activity from another tab extended it, in which case we pick up the new expiry).
    const expiryTimer = window.setTimeout(() => void dispatch(refreshSession()), user.sessionExpiresInSeconds * 1000 + EXPIRY_GRACE_MS)

    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity)
      window.clearTimeout(expiryTimer)
    }
  }, [user, dispatch])
}
