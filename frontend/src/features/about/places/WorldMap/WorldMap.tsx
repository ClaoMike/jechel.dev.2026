import { MapPin } from '../MapPin/MapPin'
import { PinHighlight } from '../PinHighlight/PinHighlight'
import { PlaceCard } from '../PlaceCard/PlaceCard'
import { DOT_SIZE } from '../worldDots'
import { ZoomControls } from '../ZoomControls/ZoomControls'
import { DOTS_PATH, useWorldMapViewModel, type WorldMapProps } from './WorldMap.viewModel'

/**
 * The world as a grid of dots, with a pin for each place: one colour per thing that happened
 * there, split into equal slices when there were several. Hover, focus or tap a pin for its
 * details. Zoom with the buttons, a pinch, or Ctrl/⌘ + scroll; drag to move around.
 */
export function WorldMap(props: WorldMapProps) {
  const { svgRef, ...vm } = useWorldMapViewModel(props)

  return (
    <div className="world-map" onKeyDown={vm.onKeyDown}>
      <div className="world-map-canvas">
        <svg ref={svgRef} viewBox={vm.viewBox} role="group" aria-label="World map" className={vm.zoomed ? 'world-map-svg world-map-zoomed' : 'world-map-svg'} {...vm.svgHandlers}>
          <path d={DOTS_PATH} className="world-map-land" strokeWidth={DOT_SIZE} strokeLinecap="round" />
          {vm.pins.map(({ key, transform, label, colors, ...handlers }) => (
            <g key={key} className="world-map-pin" transform={transform} role="button" tabIndex={0} aria-label={label} {...handlers}>
              <MapPin colors={colors} radius={vm.radius} />
            </g>
          ))}
          {vm.highlightAt && <PinHighlight at={vm.highlightAt} radius={vm.radius} />}
        </svg>
        <ZoomControls {...vm.controls} />
      </div>
      {vm.card && <PlaceCard {...vm.card} />}
    </div>
  )
}
