import type { ReactNode } from 'react'
import type { CurrentUser } from '../services/api'
import { useAuth } from './useAuth'

interface SignedInProps {
  /** Content, or a function receiving the signed-in user. */
  children: ReactNode | ((user: CurrentUser) => ReactNode)
}

/** Renders its children only when the admin is signed in (nothing while loading). */
export function SignedIn({ children }: SignedInProps) {
  const { user } = useAuth()
  if (!user) return null
  return <>{typeof children === 'function' ? children(user) : children}</>
}

/** Renders its children only when nobody is signed in (nothing while loading). */
export function SignedOut({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  return status === 'anonymous' ? <>{children}</> : null
}
