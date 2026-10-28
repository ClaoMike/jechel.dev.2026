import { YouTubeChannelButton } from '../../features/youtube/YouTubeChannelButton/YouTubeChannelButton'
import { UpdatesCard, type UpdatesMessage } from '../../features/updates/UpdatesCard/UpdatesCard'
import { useTokenAction } from '../../features/updates/useTokenAction'
import { strings } from '../../strings'

/**
 * Where the link in the confirmation email lands (/updates/confirm?token=…): confirms the
 * subscription. A page rather than an API link, so mail scanners that open links don't confirm it.
 * Once confirmed, my YouTube channel is a click away too.
 */
export function ConfirmSubscriptionPage() {
  // Confirms the subscription in the link, and says how it went.
  const state = useTokenAction('confirm')
  const message: UpdatesMessage =
    state.status === 'working'
      ? { text: strings.confirmSubscriptionPage.confirming }
      : state.status === 'done'
        ? state.email
          ? { role: 'status', text: strings.confirmSubscriptionPage.youreSubscribed, email: state.email, after: ". You'll get an email when there's a new app or video." }
          : { role: 'status', text: strings.confirmSubscriptionPage.youreSubscribedYoullGet }
        : state.status === 'test'
          ? { role: 'status', text: strings.confirmSubscriptionPage.linkTestEmailSo }
          : state.status === 'unknown'
            ? { role: 'alert', text: strings.confirmSubscriptionPage.linkIsntValidAny }
            : { role: 'alert', text: strings.confirmSubscriptionPage.didntWorkPleaseTry }
  const back = strings.confirmSubscriptionPage.seeWhatsNew
  const showYouTube = state.status === 'done'
  return <UpdatesCard message={message} back={back} actions={showYouTube && <YouTubeChannelButton label={strings.confirmSubscriptionPage.subscribeMyYoutubeChannel} subscribe />} />
}
