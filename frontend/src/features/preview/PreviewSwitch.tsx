import { useId, type CSSProperties } from 'react'
import { PREVIEW_MODES, setPreviewMode, usePreviewMode, type PreviewMode } from './preview'

const LABELS: Record<PreviewMode, string> = { normal: 'Normal', loading: 'Loading', error: 'Error' }

/** The admin's three-way slider, like the theme switch: see the site normally, while loading, or when loading fails. */
export function PreviewSwitch() {
  const name = useId()
  const mode = usePreviewMode()

  return (
    <fieldset className="preview-switch" data-mode={mode} style={{ '--preview-index': PREVIEW_MODES.indexOf(mode) } as CSSProperties}>
      <legend className="visually-hidden">Preview the site as</legend>
      <span className="preview-switch-thumb" aria-hidden="true" />
      {PREVIEW_MODES.map((option) => (
        <label key={option} className="preview-switch-option">
          <input type="radio" name={name} value={option} checked={mode === option} onChange={() => setPreviewMode(option)} className="visually-hidden" />
          {LABELS[option]}
        </label>
      ))}
    </fieldset>
  )
}
