import { useContext } from 'react'
import { AuthContext, type AuthContextValue } from './authContext'

/**
 * Current authentication state, from anywhere in the app:
 *
 *   const { isAuthenticated, isLoading, user, signOut } = useAuth()
 *
 * For simply showing/hiding UI, prefer <SignedIn> / <SignedOut>.
 */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
