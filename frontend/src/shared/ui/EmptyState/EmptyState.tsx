import type { ReactNode } from 'react'
import { InboxIcon } from '../icons'
import { strings } from '../../i18n'

/** What a list shows while it has nothing in it: an icon (an empty tray unless another is given) and a few words, the same everywhere. */
export function EmptyState({ message = strings.emptyState.nothingHereYet, icon = <InboxIcon size={28} />, hint }: { message?: string; icon?: ReactNode; hint?: string }) {
  return (
    <div className="empty-state">
      {icon}
      <p>{message}</p>
      {hint && <p className="empty-state-hint">{hint}</p>}
    </div>
  )
}
