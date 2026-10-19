import type { ReactNode } from 'react'
import { BadgeIcon, BoatIcon, CarIcon, PlaneIcon } from '../../../../components/icons/icons'
import type { LicenceCategory } from '../../../../services/api'

const ICONS: Record<LicenceCategory, (p: { size?: number }) => ReactNode> = { driving: CarIcon, flying: PlaneIcon, boating: BoatIcon, other: BadgeIcon }

/** A car, a plane, a boat, or a badge for the others. Decorative. */
export function LicenceCategoryIcon({ category, size }: { category: LicenceCategory; size?: number }) {
  const Icon = ICONS[category]
  return <Icon size={size} />
}
