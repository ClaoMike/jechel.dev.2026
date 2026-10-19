import { ExpandIcon, MinusIcon, PlusIcon } from '../../../../components/icons/icons'

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
      <button type="button" className="icon-button" aria-label="Zoom in" title="Zoom in" disabled={!canZoomIn} onClick={zoomIn}>
        <PlusIcon size={18} />
      </button>
      <button type="button" className="icon-button" aria-label="Zoom out" title="Zoom out" disabled={!canZoomOut} onClick={zoomOut}>
        <MinusIcon size={18} />
      </button>
      <button type="button" className="icon-button" aria-label="Show the whole world" title="Show the whole world" disabled={!canZoomOut} onClick={reset}>
        <ExpandIcon size={16} />
      </button>
    </div>
  )
}
