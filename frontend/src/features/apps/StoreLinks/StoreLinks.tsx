import { ExternalLinkIcon } from '../../../components/icons/icons'
import type { AppLink } from '../../../services/api'
import { useStoreLinksViewModel } from './StoreLinks.viewModel'

/** "Check it on Steam", the whole button a link (a new tab). Nothing when there are no safe links. */
export function StoreLinks(props: { links: AppLink[] }) {
  const vm = useStoreLinksViewModel(props)
  if (vm.links.length === 0) return null
  return (
    <ul className="app-links" aria-label="Where to get it">
      {vm.links.map((link) => (
        <li key={link.key}>
          <a className="button app-link" href={link.href} target="_blank" rel="noopener noreferrer">
            {link.text}
            <ExternalLinkIcon size={16} />
          </a>
        </li>
      ))}
    </ul>
  )
}
