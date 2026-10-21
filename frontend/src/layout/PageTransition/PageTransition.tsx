import { usePageTransitionViewModel } from './PageTransition.viewModel'

/**
 * The current tab's page. Switching tabs slides the pages sideways: the old one out, the new one in,
 * in the direction of the tab that was picked. The old page stays mounted (inert) until it's gone.
 */
export function PageTransition() {
  const vm = usePageTransitionViewModel()

  return (
    <div className="page-stage">
      {vm.leaving && (
        <div key={vm.leaving.key} className={`page-slide page-leave page-to-${vm.leaving.direction}`} inert aria-hidden="true" onAnimationEnd={vm.leftView}>
          {vm.leaving.page}
        </div>
      )}
      <div key={vm.pathname} className={vm.enterClassName}>
        {vm.outlet}
      </div>
    </div>
  )
}
