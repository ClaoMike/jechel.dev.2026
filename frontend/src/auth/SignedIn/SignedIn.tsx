import type { ReactNode } from 'react'
import type { CurrentUser } from '../../services/api'
import { useAppSelector } from '../../store'

interface SignedInProps {
  /** Content, or a function receiving the signed-in user. */
  children: ReactNode | ((user: CurrentUser) => ReactNode)
}

/** Renders its children only when the admin is signed in (nothing while loading). */
export function SignedIn({ children }: SignedInProps) {
  // Null also while the session is loading.
  const user = useAppSelector((state) => (state.auth.status === 'authenticated' ? state.auth.user : null))
  if (!user) return null
  return <>{typeof children === 'function' ? children(user) : children}</>
}

/** Renders its children only when nobody is signed in (nothing while loading). */
export function SignedOut({ children }: { children: ReactNode }) {
  // True only once it's known nobody is signed in.
  const anonymous = useAppSelector((state) => state.auth.status === 'anonymous')
  return anonymous ? <>{children}</> : null
}
