import { BellIcon } from '../../../components/icons/icons'
import { useSubscribeButtonViewModel } from './SubscribeButton.viewModel'
import { SubscribeDialog } from '../SubscribeDialog/SubscribeDialog'

/** "Get updates" in the header: opens the subscribe popup. */
export function SubscribeButton() {
  const vm = useSubscribeButtonViewModel()
  return (
    <>
      <button type="button" className="button button-secondary header-button subscribe-button" aria-label="Get updates by email" onClick={vm.show}>
        <BellIcon />
        <span className="header-button-label">Get updates</span>
      </button>
      {vm.open && <SubscribeDialog onClose={vm.close} />}
    </>
  )
}
