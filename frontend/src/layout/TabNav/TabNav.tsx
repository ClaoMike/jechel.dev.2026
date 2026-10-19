import { NavLink } from 'react-router'
import { ArrowLeftIcon, ArrowRightIcon, EyeOffIcon } from '../../components/icons/icons'
import { useTabNavViewModel } from './TabNav.viewModel'

/**
 * Links styled as tabs; the current one gets aria-current="page" (from NavLink). Admin-only tabs show
 * once signed in. One highlight glides to the tab that's picked, and can be dragged across from the
 * current tab: let go and it snaps to the nearest tab, which opens.
 */
export function TabNav() {
  const { navRef, ...vm } = useTabNavViewModel()

  return (
    <div className="tabs-frame" data-more-left={vm.more.left || undefined} data-more-right={vm.more.right || undefined}>
      {/* For pointers and fingers only: keyboards reach every tab with Tab (the current one is scrolled into view), so these stay out of the way. */}
      {vm.more.left && (
        <button type="button" className="tabs-arrow tabs-arrow-left" tabIndex={-1} aria-hidden="true" onClick={vm.scrollLeft}>
          <ArrowLeftIcon size={18} />
        </button>
      )}
      <nav ref={navRef} className="tabs" aria-label="Sections" data-dragging={vm.dragging ? '' : undefined} {...vm.navHandlers}>
        {vm.indicator && <span className="tab-indicator" aria-hidden="true" data-animate={vm.indicator.animate ? '' : undefined} style={vm.indicator.style} />}
        {vm.tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end className="tab" draggable={false} title={tab.hiddenFromVisitors ? 'Hidden from visitors' : undefined}>
            {tab.label}
            {tab.hiddenFromVisitors && (
              <>
                {' '}
                <span className="tab-hidden">
                  <EyeOffIcon size={14} />
                  <span className="visually-hidden">(hidden from visitors)</span>
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      {vm.more.right && (
        <button type="button" className="tabs-arrow tabs-arrow-right" tabIndex={-1} aria-hidden="true" onClick={vm.scrollRight}>
          <ArrowRightIcon size={18} />
        </button>
      )}
    </div>
  )
}
