import type { Status } from '../../../../services/api'
import { Flag } from '../../Flag'
import { RichText } from '../../RichText'

/** The citizenship and residence labels under the photo, each with its flag. */
export function StatusChips({ statuses, showEmpty }: { statuses: Status[]; showEmpty: boolean }) {
  if (statuses.length === 0) return showEmpty ? <p className="muted profile-statuses-empty">No citizenship or residence labels yet. Use Edit to add them.</p> : null
  return (
    <ul className="chips profile-statuses" aria-label="Citizenship and residence">
      {statuses.map((status, i) => (
        <li key={i} className="chip">
          <Flag code={status.flag} />
          <RichText text={status.text} />
        </li>
      ))}
    </ul>
  )
}
