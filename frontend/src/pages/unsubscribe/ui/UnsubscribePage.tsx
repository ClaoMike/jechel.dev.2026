import { UpdatesCard, type UpdatesMessage } from '@/features/updates'
import { useTokenAction } from '@/features/updates'
import { strings } from '@/shared/i18n'

/** Where "Unsubscribe" in every update email lands (/updates/unsubscribe?token=…). */
export function UnsubscribePage() {
  // Unsubscribes the address in the link, and says how it went.
  const state = useTokenAction('unsubscribe')
  const message: UpdatesMessage =
    state.status === 'working'
      ? { text: strings.unsubscribePage.unsubscribing }
      : state.status === 'done'
        ? { role: 'status', text: strings.unsubscribePage.youreUnsubscribedNoMore }
        : state.status === 'test'
          ? { role: 'status', text: strings.unsubscribePage.linkTestEmailSo }
          : state.status === 'unknown'
            ? { role: 'alert', text: strings.unsubscribePage.linkIsntCompleteOpen }
            : { role: 'alert', text: strings.unsubscribePage.didntWorkPleaseTry }
  const back = strings.unsubscribePage.backSite
  return <UpdatesCard message={message} back={back} />
}
