import { PagedGrid, type PagedGridTexts } from '../../components/PagedGrid/PagedGrid'
import { RefreshVideosButton } from '../../features/youtube/RefreshVideosButton/RefreshVideosButton'
import { YouTubeChannelButton } from '../../features/youtube/YouTubeChannelButton/YouTubeChannelButton'
import { VideoTile } from '../../features/youtube/VideoTile/VideoTile'
import { useListVideosQuery, usePrefetchVideos } from '../../store/api/appsApi'
import { useAuth } from '../../auth'
import type { YouTubeVideo } from '../../services/api'
import { strings } from '../../strings'

const TEXTS: PagedGridTexts = {
  label: strings.youTubePage.videos,
  loading: strings.youTubePage.loadingVideos,
  empty: strings.youTubePage.noVideosYet,
  error: strings.youTubePage.videosCantLoadedRight,
}

/** My YouTube videos, newest first, nine a page, after a button to the channel (and the admin's refresh, across from it). Each opens on YouTube in a new tab. */
export function YouTubePage() {
  const { isAuthenticated } = useAuth()
  const itemKey = (video: YouTubeVideo) => video.id
  const tileProps = {}

  return (
    <section className="youtube" aria-label={strings.youTubePage.youtube}>
      <div className="youtube-channel">
        <YouTubeChannelButton label={strings.youTubePage.visitMyYoutubePage} />
        {isAuthenticated && <RefreshVideosButton />}
      </div>
      <PagedGrid useItems={useListVideosQuery} usePrefetchItems={usePrefetchVideos} itemKey={itemKey} texts={TEXTS} Tile={VideoTile} tileProps={tileProps} />
    </section>
  )
}
