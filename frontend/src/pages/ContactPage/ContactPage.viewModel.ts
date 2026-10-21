import { useAppSelector } from '../../store'

/** Until it's known who's here, the page shows the contact form's shape. */
export function useContactPageViewModel() {
  return { isLoading: useAppSelector((state) => state.auth.status === 'loading') }
}
