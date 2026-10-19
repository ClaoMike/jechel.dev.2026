import { useMapPinViewModel } from './MapPin.viewModel'

/** A dot in one colour, or split into equal slices clockwise from the top. */
export function MapPin(props: { colors: string[]; radius: number }) {
  const vm = useMapPinViewModel(props)
  const { radius } = props
  if (vm.fill) return <circle r={radius} fill={vm.fill} className="world-map-pin-outline" strokeWidth={vm.outlineWidth} />
  return (
    <>
      {vm.slices.map((slice) => (
        <path key={slice.key} d={slice.d} fill={slice.color} />
      ))}
      <circle r={radius} fill="none" className="world-map-pin-outline" strokeWidth={vm.outlineWidth} />
    </>
  )
}
