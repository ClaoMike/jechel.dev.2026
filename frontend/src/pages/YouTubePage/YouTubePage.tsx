import { PagedGrid } from '../../components/PagedGrid/PagedGrid'
import { RefreshVideosButton } from '../../features/youtube/RefreshVideosButton/RefreshVideosButton'
import { YouTubeChannelButton } from '../../features/youtube/YouTubeChannelButton/YouTubeChannelButton'
import { VideoTile } from '../../features/youtube/VideoTile/VideoTile'
import { useListVideosQuery, usePrefetchVideos } from '../../store/api/appsApi'
import { useYouTubePageViewModel } from './YouTubePage.viewModel'

/** My YouTube videos, newest first, nine a page, after a button to the channel (and the admin's refresh, across from it). Each opens on YouTube in a new tab. */
export function YouTubePage() {
  const vm = useYouTubePageViewModel()

  return (
    <section className="youtube" aria-label="YouTube">
      <div className="youtube-channel">
        <YouTubeChannelButton label="Visit my YouTube page" />
        {vm.canRefresh && <RefreshVideosButton />}
      </div>
      <PagedGrid useItems={useListVideosQuery} usePrefetchItems={usePrefetchVideos} itemKey={vm.itemKey} texts={vm.texts} Tile={VideoTile} tileProps={vm.tileProps} />
    </section>
  )
}
