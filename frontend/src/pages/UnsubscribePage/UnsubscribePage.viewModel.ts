import { useTokenAction } from '../../features/updates/useTokenAction'
import type { UpdatesMessage } from '../../features/updates/UpdatesCard/UpdatesCard'

/** Unsubscribes the address in the link, and says how it went. */
export function useUnsubscribePageViewModel() {
  const state = useTokenAction('unsubscribe')
  const message: UpdatesMessage =
    state.status === 'working'
      ? { text: 'Unsubscribing…' }
      : state.status === 'done'
        ? { role: 'status', text: "You're unsubscribed: no more emails. Sorry to see you go." }
        : state.status === 'test'
          ? { role: 'status', text: "This link is from a test email, so it changes nothing: you weren't subscribed when it was sent." }
          : state.status === 'unknown'
            ? { role: 'alert', text: "This link isn't complete. Open it again from the email." }
            : { role: 'alert', text: "That didn't work. Please try the link again later." }
  return { message, back: 'Back to the site' }
}
