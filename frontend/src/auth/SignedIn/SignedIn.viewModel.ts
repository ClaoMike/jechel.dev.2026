import { useAppSelector } from '../../store'

/** The signed-in user, or null (also while the session is loading). */
export function useSignedInViewModel() {
  return useAppSelector((state) => (state.auth.status === 'authenticated' ? state.auth.user : null))
}

/** True only once it's known nobody is signed in. */
export function useSignedOutViewModel() {
  return useAppSelector((state) => state.auth.status === 'anonymous')
}
