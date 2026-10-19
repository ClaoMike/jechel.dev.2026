import { useSiteFooterViewModel } from './SiteFooter.viewModel'

/**
 * The bottom of every page: a small glass pill with the copyright and the terms (opened in a popup).
 * Hidden while the welcome popup is up.
 */
export function SiteFooter({ inert }: { inert?: boolean }) {
  const vm = useSiteFooterViewModel()
  if (!vm.shown) return null

  return (
    <footer className="site-footer" inert={inert}>
      <div className="site-footer-bar">
        <span>© {vm.year} jechel.dev</span>
        <span className="site-footer-dot" aria-hidden="true">
          ·
        </span>
        <button type="button" className="site-footer-link" onClick={vm.openTerms}>
          Terms and Conditions
        </button>
      </div>
    </footer>
  )
}
