import { CoffeeIcon } from '../../../components/icons/icons'
import { Skeleton } from '../../../components/Skeleton'
import { useSupportButtonViewModel } from './SupportButton.viewModel'

/**
 * "Buy me a coffee" in the header: a link to the donation page set in the API's configuration
 * (Support:Url, e.g. a Buy Me a Coffee page). Hidden until it's known, and when none is set.
 */
export function SupportButton() {
  const vm = useSupportButtonViewModel()

  if (vm.url === null) return <Skeleton className="header-button-skeleton" width={150} height={36} radius={999} />
  if (!vm.url) return null
  return (
    <a
      className="button header-button support-button"
      href={vm.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Buy me a coffee (opens in a new tab)"
      onClick={vm.clicked}
    >
      <CoffeeIcon />
      <span className="header-button-label">Buy me a coffee</span>
    </a>
  )
}
