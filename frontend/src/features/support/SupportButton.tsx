import { useEffect, useState } from 'react'
import { CoffeeIcon } from '../../components/icons'
import { Skeleton } from '../../components/Skeleton'
import { api } from '../../services/api'
import { trackEvent } from '../analytics'

/**
 * "Buy me a coffee" in the header: a link to the donation page set in the API's configuration
 * (Support:Url, e.g. a Buy Me a Coffee page). Hidden until it's known, and when none is set.
 */
export function SupportButton() {
  // null while loading; "" when there's no page (or it couldn't be loaded): then there's no button.
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    api.support
      .get(controller.signal)
      .then((info) => setUrl(info.url))
      .catch(() => {
        // No button, rather than a broken one.
        if (!controller.signal.aborted) setUrl('')
      })
    return () => controller.abort()
  }, [])

  if (url === null) return <Skeleton className="header-button-skeleton" width={150} height={36} radius={999} />
  if (!url) return null
  return (
    <a
      className="button header-button support-button"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Buy me a coffee (opens in a new tab)"
      onClick={() => trackEvent('Support clicked')}
    >
      <CoffeeIcon />
      <span className="header-button-label">Buy me a coffee</span>
    </a>
  )
}
