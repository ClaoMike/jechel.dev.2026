import { useId, useRef, useState, type FormEvent } from 'react'
import { Modal } from '../../../components/Modal/Modal'
import { SubscribeForm } from '../SubscribeForm/SubscribeForm'
import { SubscribeSent } from '../SubscribeSent/SubscribeSent'
import { failureOf, type SubscribeStatus } from '../../../services/api'
import { useSubscribeMutation } from '../../../store/api/communityApi'
import { trackEvent } from '../../analytics'
import { isEmail } from '../../contact/contactRules'
import { strings } from '../../../strings'

type Status = { kind: 'idle' } | { kind: 'done'; email: string; result: SubscribeStatus } | { kind: 'failed'; message: string }

/** "Get updates": an email address, then a confirmation email (double opt-in). */
export function SubscribeDialog({ onClose }: { onClose: () => void }) {
  // An email address, then a confirmation email (double opt-in).
  const inputRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [subscribe, { isLoading: sending }] = useSubscribeMutation()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = email.trim()
    if (!isEmail(value)) {
      setError(strings.subscribeDialog.enterValidEmailAddress)
      inputRef.current?.focus()
      return
    }
    setError('')
    setStatus({ kind: 'idle' })
    try {
      const result = await subscribe(value).unwrap()
      setStatus({ kind: 'done', email: value, result })
      trackEvent(result === 'sent' ? 'Subscribed' : result === 'pending' ? 'Subscribed again (not confirmed yet)' : 'Subscribed again (already subscribed)')
    } catch (e) {
      const { status: code, validationErrors } = failureOf(e)
      trackEvent('Subscribing failed', { reason: validationErrors?.email ? 'invalid address' : code === 429 ? 'too many tries' : String(code || 'no response') })
      if (validationErrors?.email) setError(validationErrors.email[0])
      else if (code === 429) setStatus({ kind: 'failed', message: strings.subscribeDialog.tooManyTriesPlease })
      // Switched off (Settings → Visitor pages) since the page loaded.
      else if (code === 404) setStatus({ kind: 'failed', message: strings.subscribeDialog.emailUpdatesArentOpen })
      else setStatus({ kind: 'failed', message: strings.subscribeDialog.didntWorkPleaseTry })
    }
  }

  const id = useId()
  const done = status.kind === 'done' ? status : null
  const messages: Record<SubscribeStatus, [string, string]> = {
    sent: [strings.subscribeDialog.almostThereCheck, strings.subscribeDialog.clickLinkEmailConfirm],
    pending: [strings.subscribeDialog.weAlreadySentConfirmation, '. Click the link in that email to confirm.'],
    alreadySubscribed: ['', strings.subscribeDialog.alreadySubscribedYoullGet],
  }
  const titleId = `${id}-title`
  const form = {
    emailId: `${id}-email`,
    errorId: `${id}-error`,
    email,
    setEmail,
    error,
    failure: status.kind === 'failed' ? status.message : null,
    sending,
    submitLabel: sending ? strings.subscribeDialog.subscribing : strings.subscribeDialog.subscribe,
    submit: (event: FormEvent<HTMLFormElement>) => void submit(event),
  }
  const sent = done && {
    before: messages[done.result][0],
    email: done.email,
    after: messages[done.result][1],
    hint: done.result === 'alreadySubscribed' ? null : strings.subscribeDialog.nothingArrivedLookSpam,
  }

  return (
    <Modal labelledBy={titleId} onClose={onClose} initialFocus={inputRef}>
      <div className="modal-header">
        <h2 id={titleId}>{strings.common.getUpdates}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label={strings.common.close}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {sent ? <SubscribeSent {...sent} onDone={onClose} /> : <SubscribeForm inputRef={inputRef} {...form} />}
    </Modal>
  )
}
