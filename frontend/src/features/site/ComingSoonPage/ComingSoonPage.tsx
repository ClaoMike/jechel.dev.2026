import { strings } from '../../../strings'

/** When every visitor page is switched off (getting ready to go live). */
export function ComingSoonPage() {
  return (
    <section className="card coming-soon" aria-labelledby="coming-soon-title">
      <h2 id="coming-soon-title">{strings.comingSoonPage.comingSoon}</h2>
      <p className="muted">{strings.comingSoonPage.siteGettingReadyPlease}</p>
    </section>
  )
}
