import { useMaintenanceScreenViewModel } from './MaintenanceScreen.viewModel'

/**
 * What visitors see while the site is under maintenance (switched on in Settings, with an optional
 * message), or when the API can't be reached at all (then it says so, and checks again by itself),
 * in the site's own frame (AppLayout's `downtime`): the themes still work, the pages don't show.
 * The frontend is served on its own (Cloudflare), so this shows even while the API is down.
 */
export function MaintenanceScreen(props: { reason: 'maintenance' | 'unreachable'; message?: string }) {
  const vm = useMaintenanceScreenViewModel(props)
  return (
    <section className="maintenance" aria-labelledby="maintenance-title">
      <div className="card maintenance-card">
        <h2 id="maintenance-title">{vm.title}</h2>
        <p>{vm.text}</p>
        <button type="button" className="button button-secondary" onClick={vm.retry}>
          Try again
        </button>
      </div>
    </section>
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
