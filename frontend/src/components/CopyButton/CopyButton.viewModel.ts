import { useEffect, useState } from 'react'

const FEEDBACK_MS = 2000

/** Copies `value`, and says how that went for a moment. */
export function useCopyButtonViewModel(value: string, label: string) {
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

  return {
    state,
    tooltip: state === 'copied' ? 'Copied!' : state === 'failed' ? "Couldn't copy" : `Copy ${label} to clipboard`,
    announcement: state === 'copied' ? `${label} copied` : state === 'failed' ? `Couldn't copy ${label}` : '',
    copy: () => void copy(),
  }
}
