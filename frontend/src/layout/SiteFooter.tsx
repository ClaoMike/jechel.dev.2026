import { useTerms } from '../features/terms'

const YEAR = new Date().getFullYear()

/** The bottom of every page: a small glass pill with the copyright and the terms (opened in a popup). */
export function SiteFooter({ inert }: { inert?: boolean }) {
  const { openTerms } = useTerms()

  return (
    <footer className="site-footer" inert={inert}>
      <div className="site-footer-bar">
        <span>© {YEAR} jechel.dev</span>
        <span className="site-footer-dot" aria-hidden="true">
          ·
        </span>
        <button type="button" className="site-footer-link" onClick={openTerms}>
          Terms and Conditions
        </button>
      </div>
    </footer>
  )
}
