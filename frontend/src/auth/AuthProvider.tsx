import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getCurrentUser, logout } from '../api/auth'
import { AuthContext, type AuthState } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    getCurrentUser(controller.signal)
      .then((user) => setState(user ? { status: 'authenticated', user } : { status: 'anonymous' }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'anonymous' })
      })

    return () => controller.abort()
  }, [])

  const signOut = useCallback(async () => {
    await logout()
    setState({ status: 'anonymous' })
  }, [])

  const value = useMemo(() => ({ state, signOut }), [state, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
