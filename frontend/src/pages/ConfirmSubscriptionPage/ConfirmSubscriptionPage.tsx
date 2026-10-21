import { UpdatesCard } from '../../features/updates/UpdatesCard/UpdatesCard'
import { useConfirmSubscriptionPageViewModel } from './ConfirmSubscriptionPage.viewModel'

/**
 * Where the link in the confirmation email lands (/updates/confirm?token=…): confirms the
 * subscription. A page rather than an API link, so mail scanners that open links don't confirm it.
 */
export function ConfirmSubscriptionPage() {
  const vm = useConfirmSubscriptionPageViewModel()
  return <UpdatesCard message={vm.message} back={vm.back} />
}
