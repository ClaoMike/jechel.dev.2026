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
