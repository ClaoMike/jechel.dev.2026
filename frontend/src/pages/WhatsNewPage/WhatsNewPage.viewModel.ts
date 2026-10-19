import { useGetLatestQuery } from '../../store/api/appsApi'
import { toLoadable } from '../../store/loadable'

/** The newest app or video, whichever came last. */
export function useWhatsNewPageViewModel() {
  const query = useGetLatestQuery()
  return { state: toLoadable(query), retry: () => void query.refetch() }
}
