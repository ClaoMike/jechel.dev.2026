import { useAppSelector } from '../../store'

export function useAdminOnlyViewModel() {
  return { status: useAppSelector((state) => state.auth.status) }
}
