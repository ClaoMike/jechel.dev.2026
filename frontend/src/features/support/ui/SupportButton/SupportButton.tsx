import { CoffeeIcon } from '@/shared/ui/icons'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useGetSupportQuery } from '../../api/supportApi'
import { trackEvent } from '@/shared/lib/analytics'
import { useFeature } from '@/entities/site'
import { strings } from '@/shared/i18n'

/**
 * "Buy me a coffee" in the header: a link to the donation page set in the API's configuration
 * (Support:Url, e.g. a Buy Me a Coffee page). Hidden until it's known, and when none is set.
 */
export function SupportButton() {
  const on = useFeature('coffee')
  const { data, isError } = useGetSupportQuery()
  // Null while it's being asked; "" when there's no page (or it couldn't be asked). Switched off in Settings, the
  // button
  // goes at once, before the API is asked again.
  const url = !on || isError ? '' : (data?.url ?? null)

  if (url === null) return <Skeleton className="header-button-skeleton" width={150} height={36} radius={999} />
  if (!url) return null
  return (
    <a
      className="button header-button support-button"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={strings.supportButton.buyMeCoffeeOpens}
      onClick={() => trackEvent('Support clicked')}
    >
      <CoffeeIcon />
      <span className="header-button-label">{strings.supportButton.buyMeCoffee}</span>
    </a>
  )
}
