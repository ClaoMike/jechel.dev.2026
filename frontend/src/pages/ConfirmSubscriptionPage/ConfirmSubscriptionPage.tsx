import { YouTubeChannelButton } from '../../features/youtube/YouTubeChannelButton/YouTubeChannelButton'
import { UpdatesCard } from '../../features/updates/UpdatesCard/UpdatesCard'
import { useConfirmSubscriptionPageViewModel } from './ConfirmSubscriptionPage.viewModel'

/**
 * Where the link in the confirmation email lands (/updates/confirm?token=…): confirms the
 * subscription. A page rather than an API link, so mail scanners that open links don't confirm it.
 * Once confirmed, my YouTube channel is a click away too.
 */
export function ConfirmSubscriptionPage() {
  const vm = useConfirmSubscriptionPageViewModel()
  return <UpdatesCard message={vm.message} back={vm.back} actions={vm.showYouTube && <YouTubeChannelButton label="Subscribe to my YouTube channel" subscribe />} />
}
