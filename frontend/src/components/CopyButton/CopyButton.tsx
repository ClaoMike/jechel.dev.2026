import { useEffect, useState } from 'react'
import { ClipboardCheckIcon, ClipboardIcon, ClipboardXIcon } from '../icons/icons'
import { strings } from '../../strings'

const FEEDBACK_MS = 2000

/** A copy-to-clipboard icon button. `label` names what is copied, e.g. "email". */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  // Says how the copy went for a moment.
  useEffect(() => {
    if (state === 'idle') return
    const timer = window.setTimeout(() => setState('idle'), FEEDBACK_MS)
    return () => window.clearTimeout(timer)
  }, [state])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setState('copied')
    } catch {
      // No clipboard permission, or not a secure context.
      setState('failed')
    }
  }

  const tooltip = state === 'copied' ? strings.copyButton.copied : state === 'failed' ? strings.copyButton.couldntCopy : strings.copyButton.copyClipboard(label)
  const announcement = state === 'copied' ? strings.copyButton.copied2(label) : state === 'failed' ? strings.copyButton.couldntCopy2(label) : ''

  return (
    <button type="button" className={`icon-button copy-button copy-button-${state}`} onClick={() => void copy()} aria-label={strings.copyButton.copy(label)} title={tooltip}>
      {state === 'copied' ? <ClipboardCheckIcon /> : state === 'failed' ? <ClipboardXIcon /> : <ClipboardIcon />}
      <span className="visually-hidden" role="status">
        {announcement}
      </span>
    </button>
  )
}
