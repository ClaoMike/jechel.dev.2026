import { OrganiseDialog } from '../OrganiseDialog/OrganiseDialog'
import { useOrganiseButtonViewModel } from './OrganiseButton.viewModel'

/** The admin's Organise button above the Apps grid, and the popup it opens to order the apps. */
export function OrganiseButton() {
  const vm = useOrganiseButtonViewModel()

  return (
    <>
      <button type="button" className="button button-secondary button-small" onClick={vm.open}>
        Organise
      </button>
      {vm.organising && <OrganiseDialog onClose={vm.close} />}
    </>
  )
}
