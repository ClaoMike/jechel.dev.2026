import { PagedGrid } from '../../components/PagedGrid/PagedGrid'
import { VideoTile } from '../../features/youtube/VideoTile/VideoTile'
import { useListVideosQuery } from '../../store/api/appsApi'
import { useYouTubePageViewModel } from './YouTubePage.viewModel'

/** My YouTube videos, newest first, nine a page. Each opens on YouTube in a new tab. */
export function YouTubePage() {
  const vm = useYouTubePageViewModel()

  return (
    <section className="youtube" aria-label="YouTube">
      <PagedGrid useItems={useListVideosQuery} itemKey={vm.itemKey} texts={vm.texts} Tile={VideoTile} tileProps={vm.tileProps} />
    </section>
  )
}
