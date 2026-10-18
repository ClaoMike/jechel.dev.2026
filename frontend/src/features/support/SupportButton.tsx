import { useEffect, useState } from 'react'
import { CoffeeIcon } from '../../components/icons'
import { api } from '../../services/api'
import { trackEvent } from '../analytics'

/**
 * "Buy me a coffee" in the header: a link to the donation page set in the API's configuration
 * (Support:Url, e.g. a Ko-fi page). Hidden until it's known, and when none is set.
 */
export function SupportButton() {
  const [url, setUrl] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    api.support
      .get(controller.signal)
      .then((info) => setUrl(info.url))
      .catch(() => {
        // No button, rather than a broken one.
      })
    return () => controller.abort()
  }, [])

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
