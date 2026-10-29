import { useAuth } from '@/entities/session'
import { forgetAcceptance } from '@/entities/terms-of-use'
import { browser } from '@/shared/lib/browser'
import { strings } from '@/shared/i18n'

/** The visitor's bar above the header, when running locally only: "User", and resetting the terms' acceptance (to see the welcome popup again). */
export function UserBar() {
  const { status } = useAuth()
  // `npm run dev` only: not the live site, and not tests (Vite's "test" mode), unless one switches it on.
  if (import.meta.env.MODE !== 'development' || status !== 'anonymous') return null
  return (
    <div className="admin-bar user-bar" role="region" aria-label={strings.userBar.developmentTools}>
      <div className="admin-bar-inner">
        <span className="admin-bar-badge">{strings.userBar.user}</span>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => {
            // The welcome popup comes back: this browser no longer remembers accepting the terms.
            forgetAcceptance()
            browser.reload()
          }}
        >
          {strings.userBar.resetTermsAcceptance}
        </button>
      </div>
    </div>
  )
}
