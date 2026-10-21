import { useAuth } from '../../auth'
import type { PagedGridTexts } from '../../components/PagedGrid/PagedGrid.viewModel'
import type { YouTubeVideo } from '../../services/api'

const TEXTS: PagedGridTexts = {
  label: 'Videos',
  loading: 'Loading videos…',
  empty: 'No videos yet.',
  error: "The videos can't be loaded right now.",
}

export function useYouTubePageViewModel() {
  const { isAuthenticated } = useAuth()
  return { texts: TEXTS, itemKey: (video: YouTubeVideo) => video.id, tileProps: {}, canRefresh: isAuthenticated }
}
