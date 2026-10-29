import type { Licence, LicenceCategory } from '@/shared/api'
import { LicenceCategoryIcon } from '../LicenceCategoryIcon/LicenceCategoryIcon'
import { LicenceLabel } from '../LicenceLabel/LicenceLabel'
import { strings } from '@/shared/i18n'

/** One kind of licence (Driving, Flying…), titled with its icon, and its licences as chips. */
export function LicenceGroup({ category, label, licences }: { category: LicenceCategory; label: string; licences: Licence[] }) {
  return (
    <div className="licence-group">
      <h3 className="licence-group-title">
        <LicenceCategoryIcon category={category} size={18} />
        {label}
      </h3>
      <ul className="chips" aria-label={strings.licenceGroup.licences(label)}>
        {licences.map((licence, i) => (
          <li key={i} className="chip licence-chip">
            <LicenceLabel code={licence.code} name={licence.name} />
          </li>
        ))}
      </ul>
    </div>
  )
}
