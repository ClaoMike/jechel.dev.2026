import { UpdatesCard } from '../../features/updates/UpdatesCard/UpdatesCard'
import { useUnsubscribePageViewModel } from './UnsubscribePage.viewModel'

/** Where "Unsubscribe" in every update email lands (/updates/unsubscribe?token=…). */
export function UnsubscribePage() {
  const vm = useUnsubscribePageViewModel()
  return <UpdatesCard message={vm.message} back={vm.back} />
}
