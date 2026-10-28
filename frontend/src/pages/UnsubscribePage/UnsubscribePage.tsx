import { UpdatesCard, type UpdatesMessage } from '../../features/updates/UpdatesCard/UpdatesCard'
import { useTokenAction } from '../../features/updates/useTokenAction'

/** Where "Unsubscribe" in every update email lands (/updates/unsubscribe?token=…). */
export function UnsubscribePage() {
  // Unsubscribes the address in the link, and says how it went.
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
  const back = 'Back to the site'
  return <UpdatesCard message={message} back={back} />
}
