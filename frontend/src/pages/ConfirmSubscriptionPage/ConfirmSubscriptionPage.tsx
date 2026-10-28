import { YouTubeChannelButton } from '../../features/youtube/YouTubeChannelButton/YouTubeChannelButton'
import { UpdatesCard, type UpdatesMessage } from '../../features/updates/UpdatesCard/UpdatesCard'
import { useTokenAction } from '../../features/updates/useTokenAction'

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
      ? { text: 'Confirming…' }
      : state.status === 'done'
        ? state.email
          ? { role: 'status', text: "You're subscribed as ", email: state.email, after: ". You'll get an email when there's a new app or video." }
          : { role: 'status', text: "You're subscribed. You'll get an email when there's a new app or video." }
        : state.status === 'test'
          ? { role: 'status', text: 'This link is from a test email, so it changes nothing. The button in the real confirmation email confirms the subscription.' }
          : state.status === 'unknown'
            ? { role: 'alert', text: 'This link isn\'t valid any more. Subscribe again with "Get updates" at the top of the page.' }
            : { role: 'alert', text: "That didn't work. Please try the link again later." }
  const back = "See what's new"
  const showYouTube = state.status === 'done'
  return <UpdatesCard message={message} back={back} actions={showYouTube && <YouTubeChannelButton label="Subscribe to my YouTube channel" subscribe />} />
}
