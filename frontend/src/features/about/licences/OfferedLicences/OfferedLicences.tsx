import type { LicenceCategory } from '../../../../services/api'
import { LicenceCategoryIcon } from '../LicenceCategoryIcon/LicenceCategoryIcon'

export interface OfferedLicence {
  key: string
  code: string
  name: string
  on: boolean
  toggle: () => void
}

/** One kind's offered licences, as toggle buttons. */
export function OfferedLicences({ category, label, licences }: { category: LicenceCategory; label: string; licences: OfferedLicence[] }) {
  return (
    <fieldset className="editor-item">
      <legend>
        <span className="licence-legend">
          <LicenceCategoryIcon category={category} size={16} />
          {label}
        </span>
      </legend>
      <div className="licence-toggles">
        {licences.map((licence) => (
          <button key={licence.key} type="button" className="licence-toggle" aria-pressed={licence.on} onClick={licence.toggle}>
            {/* Named by what it shows ("B Car"): the space keeps code and name apart for screen readers too. */}
            {licence.code && <strong className="licence-code">{licence.code}</strong>}
            {licence.code && ' '}
            {licence.name}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
