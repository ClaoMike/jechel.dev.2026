import { CopyButton } from '@/shared/ui/CopyButton'
import { PhoneIcon } from '@/shared/ui/icons'
import { strings } from '@/shared/i18n'

export interface PrivateContactItem {
  key: 'email' | 'phone'
  /** Names what is copied, e.g. "email". */
  label: string
  value: string
}

/** The admin's own email and phone (the résumé's header), each with a copy button. Visitors never get these. */
export function PrivateContact({ items, emptyText }: { items: PrivateContactItem[]; emptyText: string }) {
  return (
    <div className="profile-private">
      <PhoneIcon size={16} />
      <div>
        <strong>{strings.privateContact.onlySee}</strong>
        {items.length === 0 ? (
          <span> {emptyText}</span>
        ) : (
          <ul className="profile-private-list">
            {items.map((item) => (
              <li key={item.key}>
                <CopyButton value={item.value} label={item.label} />
                <span>{item.value}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
