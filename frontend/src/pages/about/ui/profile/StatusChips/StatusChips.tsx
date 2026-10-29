import type { Status } from '@/shared/api'
import { Flag } from '@/shared/ui/Flag'
import { RichText } from '@/shared/ui/RichText'
import { strings } from '@/shared/i18n'

/** The citizenship and residence labels under the photo, each with its flag. */
export function StatusChips({ statuses, showEmpty }: { statuses: Status[]; showEmpty: boolean }) {
  if (statuses.length === 0) return showEmpty ? <p className="muted profile-statuses-empty">{strings.statusChips.noCitizenshipResidenceLabels}</p> : null
  return (
    <ul className="chips profile-statuses" aria-label={strings.common.citizenshipResidence}>
      {statuses.map((status, i) => (
        <li key={i} className="chip">
          <Flag code={status.flag} />
          <RichText text={status.text} />
        </li>
      ))}
    </ul>
  )
}
