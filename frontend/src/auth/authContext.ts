import { createContext } from 'react'
import type { CurrentUser } from '../api/auth'

export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: CurrentUser }

export interface AuthContextValue {
  state: AuthState
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
