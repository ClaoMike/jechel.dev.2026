import { ExpandIcon, MinusIcon, PlusIcon } from '../../../../components/icons/icons'
import { VISIT_LABELS } from '../../legend'
import { RichText } from '../../RichText'
import { placeLabel } from '../placeLabel'
import { DOTS_PATH, MAX_ZOOM, useWorldMapViewModel, type WorldMapProps } from './WorldMap.viewModel'
import { DOT_SIZE } from '../worldDots'

/**
 * The world as a grid of dots, with a pin for each place: one colour per thing that happened
 * there, split into equal slices when there were several. Hover, focus or tap a pin for its
 * details. Zoom with the buttons, a pinch, or Ctrl/⌘ + scroll; drag to move around.
 */
export function WorldMap(props: WorldMapProps) {
  const { colors } = props
  const { svgRef, ...vm } = useWorldMapViewModel(props)

  return (
    <div className="world-map" onKeyDown={vm.onKeyDown}>
      <div className="world-map-canvas">
        <svg
          ref={svgRef}
          viewBox={vm.viewBox}
          role="group"
          aria-label="World map"
          className={vm.zoomed ? 'world-map-svg world-map-zoomed' : 'world-map-svg'}
          {...vm.svgHandlers}
        >
          <path d={DOTS_PATH} className="world-map-land" strokeWidth={DOT_SIZE} strokeLinecap="round" />
          {vm.pins.map((pin) => (
            <g
              key={pin.key}
              className="world-map-pin"
              transform={pin.transform}
              role="button"
              tabIndex={0}
              aria-label={pin.label}
              onPointerEnter={pin.onPointerEnter}
              onPointerLeave={pin.onPointerLeave}
              onFocus={pin.onFocus}
              onBlur={pin.onBlur}
              onClick={pin.onClick}
              onKeyDown={pin.onKeyDown}
            >
              <Pin colors={pin.colors} radius={vm.radius} />
            </g>
          ))}
          {vm.highlightAt && <Highlight at={vm.highlightAt} radius={vm.radius} />}
        </svg>
        <ZoomControls zoom={vm.zoom} onZoom={vm.zoomBy} onReset={vm.reset} />
      </div>

      {vm.card && (
        <div className="world-map-card" style={vm.card.style} onPointerEnter={vm.card.keepOpen} onPointerLeave={vm.card.hideSoon}>
          <strong>{placeLabel(vm.card.place)}</strong>
          <ul>
            {vm.card.place.visits.map((visit) => (
              <li key={visit.kind}>
                <span className="legend-swatch" style={{ background: colors[visit.kind] }} aria-hidden="true" />
                <span>{visit.note ? <RichText text={visit.note} /> : VISIT_LABELS[visit.kind]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ZoomControls({ zoom, onZoom, onReset }: { zoom: number; onZoom: (factor: number) => void; onReset: () => void }) {
  return (
    <div className="world-map-controls">
      <button type="button" className="icon-button" aria-label="Zoom in" title="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => onZoom(2)}>
        <PlusIcon size={18} />
      </button>
      <button type="button" className="icon-button" aria-label="Zoom out" title="Zoom out" disabled={zoom <= 1} onClick={() => onZoom(0.5)}>
        <MinusIcon size={18} />
      </button>
      <button type="button" className="icon-button" aria-label="Show the whole world" title="Show the whole world" disabled={zoom <= 1} onClick={onReset}>
        <ExpandIcon size={16} />
      </button>
    </div>
  )
}

/** A dot in one colour, or split into equal slices clockwise from the top. */
export function Pin({ colors, radius }: { colors: string[]; radius: number }) {
  const outline = { className: 'world-map-pin-outline', strokeWidth: radius * 0.35 }
  if (colors.length <= 1) return <circle r={radius} fill={colors[0] ?? 'currentColor'} {...outline} />
  const step = (2 * Math.PI) / colors.length
  const point = (angle: number) => `${radius * Math.sin(angle)} ${-radius * Math.cos(angle)}`
  return (
    <>
      {colors.map((color, i) => (
        <path key={i} d={`M0 0L${point(i * step)}A${radius} ${radius} 0 0 1 ${point((i + 1) * step)}Z`} fill={color} />
      ))}
      <circle r={radius} fill="none" {...outline} />
    </>
  )
}

function Highlight({ at, radius }: { at: [number, number]; radius: number }) {
  return (
    <g transform={`translate(${at[0]} ${at[1]})`} className="world-map-highlight" aria-hidden="true">
      <circle r={radius * 2} />
      <circle r={radius * 0.6} />
    </g>
  )
}
