import { usePageVisible } from '../../features/site/useSite'
import { useGetLatestQuery } from '../../store/api/appsApi'
import { toLoadable } from '../../store/loadable'

const TEXTS = {
  label: "What's new?",
  loading: "Loading what's new…",
  error: "The newest app and video can't be loaded right now.",
  empty: 'Nothing here yet. New apps and videos will show up here.',
}

/**
 * The newest app or video, whichever came last, of the sections the visitor may see (Settings → Visitor
 * pages; the admin sees them all). Waits until that's known.
 */
export function useWhatsNewPageViewModel() {
  const apps = usePageVisible('apps')
  const videos = usePageVisible('youtube')
  const known = apps !== null && videos !== null
  const query = useGetLatestQuery({ apps: apps === true, videos: videos === true }, { skip: !known })
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
