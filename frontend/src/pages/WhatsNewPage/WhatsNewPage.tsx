import { ErrorState } from '../../components/ErrorState/ErrorState'
import { LatestApp } from '../../features/whatsNew/LatestApp/LatestApp'
import { LatestVideo } from '../../features/whatsNew/LatestVideo/LatestVideo'
import { WhatsNewSkeleton } from '../../features/whatsNew/WhatsNewSkeleton/WhatsNewSkeleton'
import { useWhatsNewPageViewModel } from './WhatsNewPage.viewModel'

/**
 * The most recent thing I made: the newest app or YouTube video, whichever came last, shown in
 * full; only from the sections visitors may see. If one of them can't be loaded (e.g. YouTube isn't
 * set up), the other is shown.
 */
export function WhatsNewPage() {
  const vm = useWhatsNewPageViewModel()
  const { texts } = vm

  return (
    <section className="whats-new" aria-label={texts.label}>
      {vm.status === 'loading' && <WhatsNewSkeleton label={texts.loading} />}
      {vm.status === 'error' && <ErrorState message={texts.error} onRetry={vm.retry} />}
      {vm.empty && <p className="muted">{texts.empty}</p>}
      {vm.app && <LatestApp app={vm.app} />}
      {vm.video && <LatestVideo video={vm.video} />}
    </section>
  )
}
