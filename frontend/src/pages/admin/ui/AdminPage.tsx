import { Navigate, useSearchParams } from 'react-router'
import { GoogleSignInButton } from './GoogleSignInButton/GoogleSignInButton'
import { SignInSkeleton } from './SignInSkeleton/SignInSkeleton'
import { useAuth } from '@/entities/session'
import { api } from '@/shared/api'
import { strings } from '@/shared/i18n'

const ERROR_MESSAGES: Record<string, string> = {
  not_authorized: strings.adminPage.googleAccountNotAllowed,
  login_failed: strings.adminPage.googleSignWasCancelled,
}

/** The admin's sign-in (/admin): Google only; once signed in, home. Says why the last try failed. */
export function AdminPage() {
  // Whether the admin is signed in already (then home), and why the last sign-in failed, from the link Google came back
  // with.
  const { isLoading, isAuthenticated } = useAuth()
  const error = useSearchParams()[0].get('error')
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? strings.adminPage.somethingWentWrongPlease) : null
  const signInUrl = api.auth.googleLoginUrl('/')

  if (isAuthenticated) return <Navigate to="/" replace />
  return (
    <main className="login-page">
      {isLoading ? (
        <SignInSkeleton />
      ) : (
        <div className="login-card">
          <h1>{strings.adminPage.adminSign}</h1>
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
