import { useGetSupportQuery } from '../../../store/api/communityApi'
import { trackEvent } from '../../analytics'

/** Where the button goes: null while that's being asked; "" when there's no page (or it couldn't be asked): then there's no button. */
export function useSupportButtonViewModel() {
  const { data, isError } = useGetSupportQuery()
  return { url: isError ? '' : (data?.url ?? null), clicked: () => trackEvent('Support clicked') }
}
