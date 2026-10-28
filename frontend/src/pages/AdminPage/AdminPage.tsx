import { Navigate, useSearchParams } from 'react-router'
import { GoogleSignInButton } from '../../features/admin/GoogleSignInButton/GoogleSignInButton'
import { SignInSkeleton } from '../../features/admin/SignInSkeleton/SignInSkeleton'
import { useAuth } from '../../auth'
import { api } from '../../services/api'

const ERROR_MESSAGES: Record<string, string> = {
  not_authorized: 'This Google account is not allowed to access the admin area.',
  login_failed: 'Google sign-in was cancelled or failed. Please try again.',
}

/** The admin's sign-in (/admin): Google only; once signed in, home. Says why the last try failed. */
export function AdminPage() {
  // Whether the admin is signed in already (then home), and why the last sign-in failed, from the link Google came back
  // with.
  const { isLoading, isAuthenticated } = useAuth()
  const error = useSearchParams()[0].get('error')
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? 'Something went wrong. Please try again.') : null
  const signInUrl = api.auth.googleLoginUrl('/')

  if (isAuthenticated) return <Navigate to="/" replace />
  return (
    <main className="login-page">
      {isLoading ? (
        <SignInSkeleton />
      ) : (
        <div className="login-card">
          <h1>Admin sign in</h1>
          {errorMessage && (
            <p role="alert" className="login-error">
              {errorMessage}
            </p>
          )}
          <GoogleSignInButton href={signInUrl} />
        </div>
      )}
    </main>
  )
}
