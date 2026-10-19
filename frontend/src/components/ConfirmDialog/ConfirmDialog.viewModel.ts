import { useId, useRef, useState } from 'react'

/** Waits for `onConfirm` (it may be async), says so if it fails, and closes on success. */
export function useConfirmDialogViewModel({ onConfirm, onClose }: { onConfirm: () => void | Promise<void>; onClose: () => void }) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')

  async function confirm() {
    setState('busy')
    try {
      await onConfirm()
    } catch {
      setState('failed')
      return
    }
    onClose()
  }

  return {
    titleId: useId(),
    cancelRef: useRef<HTMLButtonElement>(null),
    busy: state === 'busy',
    failed: state === 'failed',
    confirm: () => void confirm(),
    // Not while it's working.
    close: () => state !== 'busy' && onClose(),
  }
}
