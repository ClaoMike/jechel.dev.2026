import { useGetLatestQuery } from '../../store/api/appsApi'
import { toLoadable } from '../../store/loadable'

const TEXTS = {
  label: "What's new?",
  loading: "Loading what's new…",
  error: "The newest app and video can't be loaded right now.",
  empty: 'Nothing here yet. New apps and videos will show up here.',
}

/** The newest app or video, whichever came last. */
export function useWhatsNewPageViewModel() {
  const query = useGetLatestQuery()
  const state = toLoadable(query)
  const latest = state.status === 'loaded' ? state.data : null
  return {
    texts: TEXTS,
    status: state.status,
    empty: state.status === 'loaded' && latest === null,
    app: latest?.kind === 'app' ? latest.app : null,
    video: latest?.kind === 'video' ? latest.video : null,
    retry: () => void query.refetch(),
  }
}
