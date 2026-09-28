import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, type CurrentUser } from '../services/api'
import { AuthContext, type AuthContextValue } from './authContext'

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: CurrentUser }

/** The API extends a session at most once a minute, so pinging more often is pointless. */
export const ACTIVITY_REFRESH_MS = 60_000
/** Re-check just after the session should have ended, to absorb network latency. */
const EXPIRY_GRACE_MS = 2_000
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'mousemove'] as const

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const lastRefreshAt = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    lastRefreshAt.current = Date.now()

    api.auth.me(controller.signal)
      .then((user) => setState(toAuthState(user)))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'anonymous' })
      })

    return () => controller.abort()
  }, [])

  const refresh = useCallback(async () => {
    lastRefreshAt.current = Date.now()
    try {
      setState(toAuthState(await api.auth.me()))
    } catch {
      // Network hiccup: keep the current state and try again on the next activity/timer.
    }
  }, [])

  const user = state.status === 'authenticated' ? state.user : null

  // Signed in: activity in the page extends the session; without activity, sign out when it ends.
  // Re-armed after every refresh, since each one returns a fresh user object and expiry.
  useEffect(() => {
    if (!user) return

    const onActivity = () => {
      if (Date.now() - lastRefreshAt.current >= ACTIVITY_REFRESH_MS) void refresh()
    }
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onActivity, { passive: true })

    // This check can't extend the session: by the time it runs, the server has already ended it
    // (unless activity from another tab extended it, in which case we pick up the new expiry).
    const expiryTimer = window.setTimeout(() => void refresh(), user.sessionExpiresInSeconds * 1000 + EXPIRY_GRACE_MS)

    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity)
      window.clearTimeout(expiryTimer)
    }
  }, [user, refresh])

  const signOut = useCallback(async () => {
    await api.auth.logout()
    setState({ status: 'anonymous' })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      isLoading: state.status === 'loading',
      isAuthenticated: state.status === 'authenticated',
      user,
      signOut,
    }),
    [state.status, user, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function toAuthState(user: CurrentUser | null): AuthState {
  return user ? { status: 'authenticated', user } : { status: 'anonymous' }
}
