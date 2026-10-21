import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth'
import { api } from '../../services/api'

const ERROR_MESSAGES: Record<string, string> = {
  not_authorized: 'This Google account is not allowed to access the admin area.',
  login_failed: 'Google sign-in was cancelled or failed. Please try again.',
}

/** Whether the admin is signed in already (then home), and why the last sign-in failed, from the link Google came back with. */
export function useAdminPageViewModel() {
  const { isLoading, isAuthenticated } = useAuth()
  const error = useSearchParams()[0].get('error')
  return {
    isLoading,
    isAuthenticated,
    errorMessage: error ? (ERROR_MESSAGES[error] ?? 'Something went wrong. Please try again.') : null,
    signInUrl: api.auth.googleLoginUrl('/'),
  }
}
