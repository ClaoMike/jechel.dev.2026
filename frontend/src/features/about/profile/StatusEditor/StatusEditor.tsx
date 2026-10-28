import { useId } from 'react'
import { ItemControls, TextField } from '../../../../components/fields'
import type { Status } from '../../../../services/api'
import { Flag } from '../../Flag'
import { FLAG_CHOICES, flagName, guessFlag } from '../../flags'
import { strings } from '../../../../strings'

export interface StatusEditorProps {
  index: number
  count: number
  status: Status
  error?: string
  onChange: (status: Status) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}

/**
 * One label under the photo: its flag (a choice, or guessed from the words until one is chosen by hand) and its text,
 * with move and remove.
 */
export function StatusEditor({ index, count, status, error, onChange, onMove, onRemove }: StatusEditorProps) {
  const flagId = useId()
  // A flag that isn't in the list (e.g. saved before the list changed) is still offered, under its name.
  const unlisted = status.flag && !FLAG_CHOICES.some((c) => c.code === status.flag) ? [{ code: status.flag, name: flagName(status.flag) }] : []

  return (
    <div className="status-editor" role="group" aria-label={strings.statusEditor.label(index + 1)}>
      <div className="field">
        <label htmlFor={flagId}>{strings.statusEditor.flag}</label>
        <div className="status-flag">
          <Flag code={status.flag} />
          <select id={flagId} className="select" value={status.flag} onChange={(e) => onChange({ ...status, flag: e.target.value })}>
            <option value="">{strings.statusEditor.noFlag}</option>
            {[...FLAG_CHOICES, ...unlisted].map(({ code, name }) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {/* Picks the flag the words suggest ("Romanian citizenship" → Romania) until one is chosen by hand. */}
      <TextField label={strings.statusEditor.label2} value={status.text} required onChange={(text) => onChange({ text, flag: status.flag || guessFlag(text) })} error={error} />
      <ItemControls name={`label ${index + 1}`} index={index} count={count} onMove={onMove} onRemove={onRemove} />
    </div>
  )
}
