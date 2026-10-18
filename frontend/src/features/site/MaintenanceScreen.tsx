import { useAppDispatch } from '../../store'
import { fetchSite } from '../../store/siteSlice'

/**
 * What visitors see while the site is under maintenance (switched on in Settings, with an optional
 * message), or when the API can't be reached at all (then it says so, and checks again by itself).
 * The frontend is served on its own (Cloudflare), so this shows even while the API is down.
 */
export function MaintenanceScreen({ reason, message }: { reason: 'maintenance' | 'unreachable'; message?: string }) {
  const dispatch = useAppDispatch()
  return (
    <main className="maintenance" aria-labelledby="maintenance-title">
      <div className="maintenance-card">
        <p className="maintenance-brand">jechel.dev</p>
        <h1 id="maintenance-title">{reason === 'maintenance' ? "We'll be right back" : "Can't reach the site right now"}</h1>
        <p>
          {reason === 'maintenance'
            ? message || 'The site is having some work done. Please check back soon.'
            : "It may be down for a moment. This page checks again every half a minute and comes back by itself."}
        </p>
        <button type="button" className="button button-secondary" onClick={() => void dispatch(fetchSite())}>
          Try again
        </button>
      </div>
    </main>
  )
}

/** When every visitor page is switched off (getting ready to go live). */
export function ComingSoonPage() {
  return (
    <section className="card coming-soon" aria-labelledby="coming-soon-title">
      <h2 id="coming-soon-title">Coming soon</h2>
      <p className="muted">The site is getting ready. Please check back soon.</p>
    </section>
  )
}
