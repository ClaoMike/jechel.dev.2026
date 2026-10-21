import { PhoneIcon } from '../../../../components/icons/icons'

/** The admin's own line: what goes in the résumé's header. Visitors never get these. */
export function PrivateContact({ text }: { text: string }) {
  return (
    <p className="profile-private">
      <PhoneIcon size={16} />
      <span>
        <strong>Only you see this:</strong> {text}
      </span>
    </p>
  )
}
