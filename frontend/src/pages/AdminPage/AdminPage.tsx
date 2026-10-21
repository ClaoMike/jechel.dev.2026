import { Navigate } from 'react-router'
import { GoogleSignInButton } from '../../features/admin/GoogleSignInButton/GoogleSignInButton'
import { SignInSkeleton } from '../../features/admin/SignInSkeleton/SignInSkeleton'
import { useAdminPageViewModel } from './AdminPage.viewModel'

/** The admin's sign-in (/admin): Google only; once signed in, home. Says why the last try failed. */
export function AdminPage() {
  const vm = useAdminPageViewModel()

  if (vm.isAuthenticated) return <Navigate to="/" replace />
  return (
    <main className="login-page">
      {vm.isLoading ? (
        <SignInSkeleton />
      ) : (
        <div className="login-card">
          <h1>Admin sign in</h1>
          {vm.errorMessage && (
            <p role="alert" className="login-error">
              {vm.errorMessage}
            </p>
          )}
          <GoogleSignInButton href={vm.signInUrl} />
        </div>
      )}
    </main>
  )
}
