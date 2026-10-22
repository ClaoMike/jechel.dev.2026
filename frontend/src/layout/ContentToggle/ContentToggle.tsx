import { createPortal } from 'react-dom'
import { EyeIcon, EyeOffIcon } from '../../components/icons/icons'
import { useContentToggleViewModel, type ContentToggleProps } from './ContentToggle.viewModel'

/**
 * Vice only: hides the page so just the Riviera scene shows. While it's hidden, the button (and the
 * cursor) fade out after a few seconds of stillness and come back on any movement; Escape brings
 * the page back too.
 *
 * On wide screens it floats at the bottom right, with its words. On phones it's an icon in the header,
 * left of "Buy me a coffee": while the page shows it's rendered inside `slot` there, so it scrolls,
 * bounces and slides exactly as the header does. While the page is hidden the header is away, so it
 * waits in the bottom-right corner instead.
 */
export function ContentToggle(props: ContentToggleProps) {
  const { buttonRef, container, ...vm } = useContentToggleViewModel(props)

  const button = (
    <button ref={buttonRef} type="button" className={vm.className} title={vm.compact ? vm.label : undefined} onClick={vm.toggle}>
      {vm.hidden ? <EyeIcon /> : <EyeOffIcon />}
      <span className={vm.compact ? 'visually-hidden' : undefined}>{vm.label}</span>
    </button>
  )
  return container ? createPortal(button, container) : button
}
