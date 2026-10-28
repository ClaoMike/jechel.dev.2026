import { useAppDispatch } from '../../../store'
import { fetchSite } from '../../../store/siteSlice'

/**
 * What visitors see while the site is under maintenance (switched on in Settings, with an optional
 * message), or when the API can't be reached at all (then it says so, and checks again by itself),
 * in the site's own frame (AppLayout's `downtime`): the themes still work, the pages don't show.
 * The frontend is served on its own (Cloudflare), so this shows even while the API is down.
 */
export function MaintenanceScreen({ reason, message }: { reason: 'maintenance' | 'unreachable'; message?: string }) {
  const dispatch = useAppDispatch()
  const title = reason === 'maintenance' ? "We'll be right back" : "Can't reach the site right now"
  const text =
    reason === 'maintenance'
      ? message || 'The site is having some work done. Please check back soon.'
      : 'It may be down for a moment. This page checks again every half a minute and comes back by itself.'
  return (
    <section className="maintenance" aria-labelledby="maintenance-title">
      <div className="card maintenance-card">
        <h2 id="maintenance-title">{title}</h2>
        <p>{text}</p>
        <button type="button" className="button button-secondary" onClick={() => void dispatch(fetchSite())}>
          Try again
        </button>
      </div>
    </section>
  )
}
