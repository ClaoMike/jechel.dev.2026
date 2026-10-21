import { useId, type CSSProperties } from 'react'
import { useAppDispatch, useAppSelector } from '../../../store'
import { PREVIEW_MODES, previewModeChanged, type PreviewMode } from '../../../store/previewSlice'

const LABELS: Record<PreviewMode, string> = { normal: 'Normal', loading: 'Loading', error: 'Error' }

export function usePreviewSwitchViewModel() {
  const dispatch = useAppDispatch()
  const mode = useAppSelector((state) => state.preview.mode)
  return {
    name: useId(),
    mode,
    style: { '--preview-index': PREVIEW_MODES.indexOf(mode) } as CSSProperties,
    options: PREVIEW_MODES.map((option) => ({ value: option, label: LABELS[option], checked: mode === option, choose: () => dispatch(previewModeChanged(option)) })),
  }
}
