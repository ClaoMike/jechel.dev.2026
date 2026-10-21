import { EyeIcon, EyeOffIcon } from '../../components/icons/icons'
import { useContentToggleViewModel, type ContentToggleProps } from './ContentToggle.viewModel'

/**
 * Vice only: hides the page so just the Riviera scene shows. While it's hidden, the button (and the
 * cursor) fade out after a few seconds of stillness and come back on any movement; Escape brings
 * the page back too.
 *
 * On wide screens it floats at the bottom right, with its words. On phones it's an icon in the header,
 * left of "Buy me a coffee": it's pinned over `anchor` (an empty slot there), not inside the header,
 * because the header slides away with the page and the button has to stay to bring it back. While
 * the page is hidden it waits in the bottom-right corner instead.
 */
export function ContentToggle(props: ContentToggleProps) {
  const vm = useContentToggleViewModel(props)

  return (
    <button type="button" className={vm.className} style={vm.style} title={vm.compact ? vm.label : undefined} onClick={vm.toggle}>
      {vm.hidden ? <EyeIcon /> : <EyeOffIcon />}
      <span className={vm.compact ? 'visually-hidden' : undefined}>{vm.label}</span>
    </button>
  )
}
