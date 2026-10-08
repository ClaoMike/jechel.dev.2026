import { useEffect, useState } from 'react'

const FEEDBACK_MS = 2000

/** Copies `value` to the clipboard and says so for a moment. `label` names what is copied, e.g. "email". */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

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

  return (
    <button type="button" className="button button-small button-secondary copy-button" onClick={() => void copy()} aria-label={`Copy ${label}`}>
      <span aria-hidden="true">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Failed' : 'Copy'}</span>
      <span className="visually-hidden" role="status">
        {state === 'copied' ? `${label} copied` : state === 'failed' ? `Couldn't copy ${label}` : ''}
      </span>
    </button>
  )
}
