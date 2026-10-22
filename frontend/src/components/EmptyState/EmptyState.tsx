import { InboxIcon } from '../icons/icons'

/** What a list shows while it has nothing in it: an empty tray and a few words, the same everywhere. */
export function EmptyState({ message = 'Nothing here yet' }: { message?: string }) {
  return (
    <div className="empty-state">
      <InboxIcon size={28} />
      <p>{message}</p>
    </div>
  )
}
