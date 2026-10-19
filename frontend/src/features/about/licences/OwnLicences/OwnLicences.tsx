import { ItemControls } from '../../../../components/fields'
import type { Licence } from '../../../../services/api'
import { LicenceLabel } from '../LicenceLabel/LicenceLabel'

export interface OwnLicence {
  key: number
  licence: Licence
  /** Its kind's name: "Driving". */
  kind: string
  error?: string
  remove: () => void
}

/** The licences the admin added by hand: each with its kind, any error, and a remove button. */
export function OwnLicences({ licences }: { licences: OwnLicence[] }) {
  if (licences.length === 0) return null
  return (
    <ul className="licence-own">
      {licences.map(({ key, licence, kind, error, remove }) => (
        <li key={key}>
          <span className="chip licence-chip">
            <LicenceLabel code={licence.code} name={licence.name} />
          </span>
          <span className="muted"> {kind}</span>
          {error && <span className="field-error"> {error}</span>}
          <ItemControls name={licence.name} index={0} count={1} onRemove={remove} />
        </li>
      ))}
    </ul>
  )
}
