import { useId } from 'react'
import type { Status } from '../../../../services/api'
import { FLAG_CHOICES, flagName, guessFlag } from '../../flags'

export interface StatusEditorProps {
  index: number
  count: number
  status: Status
  error?: string
  onChange: (status: Status) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}

/** One label: its flag (a choice, or guessed from the words until one is chosen by hand) and its text. */
export function useStatusEditorViewModel({ index, status, onChange }: StatusEditorProps) {
  // A flag that isn't in the list (e.g. saved before the list changed) is still offered, under its name.
  const unlisted = status.flag && !FLAG_CHOICES.some((c) => c.code === status.flag) ? [{ code: status.flag, name: flagName(status.flag) }] : []
  return {
    flagId: useId(),
    groupLabel: `Label ${index + 1}`,
    name: `label ${index + 1}`,
    flags: [...FLAG_CHOICES, ...unlisted],
    setFlag: (flag: string) => onChange({ ...status, flag }),
    // Picks the flag the words suggest ("Romanian citizenship" → Romania) until one is chosen by hand.
    setText: (text: string) => onChange({ text, flag: status.flag || guessFlag(text) }),
  }
}
