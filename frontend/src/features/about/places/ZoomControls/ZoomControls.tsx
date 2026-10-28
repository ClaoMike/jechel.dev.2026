import { ExpandIcon, MinusIcon, PlusIcon } from '../../../../components/icons/icons'
import { strings } from '../../../../strings'

export interface ZoomControlsProps {
  canZoomIn: boolean
  canZoomOut: boolean
  zoomIn: () => void
  zoomOut: () => void
  /** Back to the whole world. */
  reset: () => void
}

/** Zoom in, zoom out, and back to the whole world, in the map's corner. */
export function ZoomControls({ canZoomIn, canZoomOut, zoomIn, zoomOut, reset }: ZoomControlsProps) {
  return (
    <div className="world-map-controls">
      <button type="button" className="icon-button" aria-label={strings.zoomControls.zoom} title={strings.zoomControls.zoom} disabled={!canZoomIn} onClick={zoomIn}>
        <PlusIcon size={18} />
      </button>
      <button type="button" className="icon-button" aria-label={strings.zoomControls.zoomOut} title={strings.zoomControls.zoomOut} disabled={!canZoomOut} onClick={zoomOut}>
        <MinusIcon size={18} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={strings.zoomControls.showWholeWorld}
        title={strings.zoomControls.showWholeWorld}
        disabled={!canZoomOut}
        onClick={reset}
      >
        <ExpandIcon size={16} />
      </button>
    </div>
  )
}
