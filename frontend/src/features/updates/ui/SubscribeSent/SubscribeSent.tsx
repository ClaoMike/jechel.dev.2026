import { strings } from '@/shared/i18n'

export interface SubscribeSentProps {
  /** The message, around the address in bold: "Almost there: check " + email + " and click…". */
  before: string
  email: string
  after: string
  /** "Nothing arrived? …", when an email was (or will be) sent. */
  hint: string | null
  onDone: () => void
}

/** After subscribing: what happens next (check the email), or that the address is subscribed already. */
export function SubscribeSent({ before, email, after, hint, onDone }: SubscribeSentProps) {
  return (
    <div className="subscribe-sent">
      <p role="status">
        {before}
        <strong>{email}</strong>
        {after}
      </p>
      {hint && <p className="muted">{hint}</p>}
      <button type="button" className="button" onClick={onDone}>
        {strings.subscribeSent.done}
      </button>
    </div>
  )
}
