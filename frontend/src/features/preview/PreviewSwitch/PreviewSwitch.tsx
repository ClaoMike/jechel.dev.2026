import { useId, type CSSProperties } from 'react'
import { useAppDispatch, useAppSelector } from '../../../store'
import { PREVIEW_MODES, previewModeChanged, type PreviewMode } from '../../../store/previewSlice'
import { strings } from '../../../strings'

const LABELS: Record<PreviewMode, string> = { normal: strings.previewSwitch.normal, loading: strings.previewSwitch.loading, error: strings.previewSwitch.error }

/** The admin's three-way slider, like the theme switch: see the site normally, while loading, or when loading fails. */
export function PreviewSwitch() {
  const dispatch = useAppDispatch()
  const mode = useAppSelector((state) => state.preview.mode)
  const name = useId()
  const options = PREVIEW_MODES.map((option) => ({ value: option, label: LABELS[option], checked: mode === option, choose: () => dispatch(previewModeChanged(option)) }))

  return (
    <fieldset className="preview-switch" data-mode={mode} style={{ '--preview-index': PREVIEW_MODES.indexOf(mode) } as CSSProperties}>
      <legend className="visually-hidden">{strings.previewSwitch.previewSite}</legend>
      <span className="preview-switch-thumb" aria-hidden="true" />
      {options.map((option) => (
        <label key={option.value} className="preview-switch-option">
          <input type="radio" name={name} value={option.value} checked={option.checked} onChange={option.choose} className="visually-hidden" />
          {option.label}
        </label>
      ))}
    </fieldset>
  )
}
