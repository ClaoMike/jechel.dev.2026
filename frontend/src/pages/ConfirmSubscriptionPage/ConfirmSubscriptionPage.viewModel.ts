import { useTokenAction } from '../../features/updates/useTokenAction'
import type { UpdatesMessage } from '../../features/updates/UpdatesCard/UpdatesCard'

/** Confirms the subscription in the link, and says how it went. */
export function useConfirmSubscriptionPageViewModel() {
  const state = useTokenAction('confirm')
  const message: UpdatesMessage =
    state.status === 'working'
      ? { text: 'Confirming…' }
      : state.status === 'done'
        ? state.email
          ? { role: 'status', text: "You're subscribed as ", email: state.email, after: ". You'll get an email when there's a new app or video." }
          : { role: 'status', text: "You're subscribed. You'll get an email when there's a new app or video." }
        : state.status === 'unknown'
          ? { role: 'alert', text: 'This link isn\'t valid any more. Subscribe again with "Get updates" at the top of the page.' }
          : { role: 'alert', text: "That didn't work. Please try the link again later." }
  return { message, back: "See what's new" }
}
