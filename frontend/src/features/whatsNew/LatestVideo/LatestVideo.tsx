import type { YouTubeVideo } from '../../../services/api'
import { VideoDetailsView } from '../../youtube/VideoDetailsView/VideoDetailsView'
import { WhatsNewCard } from '../WhatsNewCard/WhatsNewCard'
import { useLatestVideoViewModel } from './LatestVideo.viewModel'

/** The newest video, to watch here: the player, its description, and a link to it on YouTube. */
export function LatestVideo(props: { video: YouTubeVideo }) {
  const vm = useLatestVideoViewModel(props)
  return (
    <WhatsNewCard {...vm}>
      <VideoDetailsView video={props.video} />
    </WhatsNewCard>
  )
}
