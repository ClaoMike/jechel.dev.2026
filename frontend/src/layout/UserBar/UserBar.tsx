import { useAuth } from '../../auth'
import { forgetAcceptance } from '../../features/terms/acceptance'
import { browser } from '../../utils/browser'

/** The visitor's bar above the header, when running locally only: "User", and resetting the terms' acceptance (to see the welcome popup again). */
export function UserBar() {
  const { status } = useAuth()
  // `npm run dev` only: not the live site, and not tests (Vite's "test" mode), unless one switches it on.
  if (import.meta.env.MODE !== 'development' || status !== 'anonymous') return null
  return (
    <div className="admin-bar user-bar" role="region" aria-label="Development tools">
      <div className="admin-bar-inner">
        <span className="admin-bar-badge">User</span>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => {
            // The welcome popup comes back: this browser no longer remembers accepting the terms.
            forgetAcceptance()
            browser.reload()
          }}
        >
          Reset terms acceptance
        </button>
      </div>
    </div>
  )
}
