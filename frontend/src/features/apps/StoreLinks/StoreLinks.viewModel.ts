import type { AppLink } from '../../../services/api'
import { isSafeUrl } from '../../about/format'

/** Only the links that are safe to follow, as "Check it on …" buttons. */
export function useStoreLinksViewModel({ links }: { links: AppLink[] }) {
  return { links: links.filter((link) => isSafeUrl(link.url)).map((link, i) => ({ key: i, href: link.url, text: `Check it on ${link.label}` })) }
}
