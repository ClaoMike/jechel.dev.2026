import { useGetSupportQuery } from '../../../store/api/communityApi'
import { useFeature } from '../../site/useSite'
import { trackEvent } from '../../analytics'

/**
 * Where the button goes: null while that's being asked; "" when there's no page (or it couldn't be asked): then there's no
 * button. Switched off in Settings, it goes at once, before the API is asked again.
 */
export function useSupportButtonViewModel() {
  const on = useFeature('coffee')
  const { data, isError } = useGetSupportQuery()
  return { url: !on || isError ? '' : (data?.url ?? null), clicked: () => trackEvent('Support clicked') }
}
