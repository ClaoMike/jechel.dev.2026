import { createContext } from 'react'
import type { CurrentUser } from '../services/api'

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated'

export interface AuthContextValue {
  status: AuthStatus
  /** True until the first session check finishes. Avoid flashing signed-out UI meanwhile. */
  isLoading: boolean
  isAuthenticated: boolean
  /** The signed-in user, or null. */
  user: CurrentUser | null
  /** Ends the session everywhere. */
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * When the first check fails without an answer (the API down, restarting, a network error), how long
 * to wait before each new try: the session is still there, so this isn't "signed out".
 */
export const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 15_000] as const
