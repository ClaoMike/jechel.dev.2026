import { useCallback } from 'react'
import type { CurrentUser } from '../services/api'
import { useAppDispatch, useAppSelector } from '../store'
import { signOut, type AuthStatus } from '../store/authSlice'

export interface AuthValue {
  status: AuthStatus
  /** True until the first session check finishes. Avoid flashing signed-out UI meanwhile. */
  isLoading: boolean
  isAuthenticated: boolean
  /** The signed-in user, or null. */
  user: CurrentUser | null
  /** Signs out this device (and this browser's other tabs). */
  signOut: () => Promise<void>
}

/**
 * The session, from the store (store/authSlice), for view models:
 *
 *   const { isAuthenticated, isLoading, user, signOut } = useAuth()
 *
 * For simply showing/hiding UI, prefer <SignedIn> / <SignedOut>.
 */
export function useAuth(): AuthValue {
  const state = useAppSelector((s) => s.auth)
  const dispatch = useAppDispatch()
  const end = useCallback(() => dispatch(signOut()).unwrap(), [dispatch])
  return {
    status: state.status,
    isLoading: state.status === 'loading',
    isAuthenticated: state.status === 'authenticated',
    user: state.status === 'authenticated' ? state.user : null,
    signOut: end,
  }
}
