import { useTerms } from '../../features/terms'
import { strings } from '../../strings'

const YEAR = new Date().getFullYear()

/**
 * The bottom of every page: a small glass pill with the copyright and the terms (opened in a popup).
 * Hidden while the welcome popup is up.
 */
export function SiteFooter({ inert }: { inert?: boolean }) {
  const { openTerms, welcomeOpen } = useTerms()
  // The welcome popup has its own link to the terms.
  if (welcomeOpen) return null

  return (
    <footer className="site-footer" inert={inert}>
      <div className="site-footer-bar">
        <span>
          © {YEAR} {strings.siteFooter.jechelDev}
        </span>
        <span className="site-footer-dot" aria-hidden="true">
          ·
        </span>
        <button type="button" className="site-footer-link" onClick={openTerms}>
          {strings.common.termsConditions}
        </button>
      </div>
    </footer>
  )
}
