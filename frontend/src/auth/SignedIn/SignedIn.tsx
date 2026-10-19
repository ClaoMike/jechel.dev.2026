import type { ReactNode } from 'react'
import type { CurrentUser } from '../../services/api'
import { useSignedInViewModel, useSignedOutViewModel } from './SignedIn.viewModel'

interface SignedInProps {
  /** Content, or a function receiving the signed-in user. */
  children: ReactNode | ((user: CurrentUser) => ReactNode)
}

/** Renders its children only when the admin is signed in (nothing while loading). */
export function SignedIn({ children }: SignedInProps) {
  const user = useSignedInViewModel()
  if (!user) return null
  return <>{typeof children === 'function' ? children(user) : children}</>
}

/** Renders its children only when nobody is signed in (nothing while loading). */
export function SignedOut({ children }: { children: ReactNode }) {
  const anonymous = useSignedOutViewModel()
  return anonymous ? <>{children}</> : null
}
