import { useCopyButtonViewModel } from './CopyButton.viewModel'
import { ClipboardCheckIcon, ClipboardIcon, ClipboardXIcon } from '../icons/icons'

/** A copy-to-clipboard icon button. `label` names what is copied, e.g. "email". */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const vm = useCopyButtonViewModel(value, label)

  return (
    <button type="button" className={`icon-button copy-button copy-button-${vm.state}`} onClick={vm.copy} aria-label={`Copy ${label}`} title={vm.tooltip}>
      {vm.state === 'copied' ? <ClipboardCheckIcon /> : vm.state === 'failed' ? <ClipboardXIcon /> : <ClipboardIcon />}
      <span className="visually-hidden" role="status">
        {vm.announcement}
      </span>
    </button>
  )
}
