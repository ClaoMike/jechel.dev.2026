import { useAuth } from '../../auth'
import { forgetAcceptance } from '../../features/terms/acceptance'
import { browser } from '../../utils/browser'

/**
 * Only when running locally (npm run dev), for a visitor (nobody signed in): tools to try the site as a
 * visitor does. Never in the live site.
 */
export function useUserBarViewModel() {
  const { status } = useAuth()
  return {
    // `npm run dev` only: not the live site, and not tests (Vite's "test" mode), unless one switches it on.
    shown: import.meta.env.MODE === 'development' && status === 'anonymous',
    // The welcome popup comes back: this browser no longer remembers accepting the terms.
    resetTerms: () => {
      forgetAcceptance()
      browser.reload()
    },
  }
}
