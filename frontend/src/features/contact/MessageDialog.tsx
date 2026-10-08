import { useEffect, useId, useState } from 'react'
import { CopyButton } from '../../components/CopyButton'
import { Modal } from '../../components/Modal'
import { api, type ContactMessageDetails } from '../../services/api'
import { formatDateTime } from '../../utils/formatDate'

type State =
  | { status: 'loading' }
  | { status: 'loaded'; message: ContactMessageDetails }
  | { status: 'error' }

interface MessageDialogProps {
  messageId: number
  /** The name from the list, shown while the details load. */
  name: string
  onClose: () => void
  /** Called once the message has been marked as read on the server. */
  onRead: (id: number) => void
}

/** A message's details, each with a copy button. Opening it marks the message as read. */
export function MessageDialog({ messageId, name, onClose, onRead }: MessageDialogProps) {
  const titleId = useId()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      let message: ContactMessageDetails
      try {
        message = await api.contact.getMessage(messageId, controller.signal)
      } catch {
        if (!controller.signal.aborted) setState({ status: 'error' })
        return
      }
      setState({ status: 'loaded', message })

      if (message.readAt !== null) return
      try {
        await api.contact.markAsRead(messageId)
        if (!controller.signal.aborted) onRead(messageId)
      } catch {
        // It stays unread in the list; the next time it's opened will try again.
      }
    }

    void load()
    return () => controller.abort()
  }, [messageId, onRead])

  return (
    <Modal labelledBy={titleId} onClose={onClose}>
      <header className="modal-header">
        <h2 id={titleId}>Message from {state.status === 'loaded' ? state.message.name : name}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
      </header>

      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <p role="alert">This message couldn't be loaded. Please try again.</p>}
      {state.status === 'loaded' && (
        <dl className="message-details">
          <DetailRow label="Name" value={state.message.name} />
          <DetailRow label="Email" value={state.message.email} href={`mailto:${state.message.email}`} />
          <DetailRow label="Received" value={formatDateTime(state.message.receivedAt)} />
          <DetailRow label="Message" value={state.message.message} multiline />
        </dl>
      )}
    </Modal>
  )
}

interface DetailRowProps {
  label: string
  value: string
  href?: string
  multiline?: boolean
}

function DetailRow({ label, value, href, multiline = false }: DetailRowProps) {
  return (
    <div className={multiline ? 'detail-row detail-row-multiline' : 'detail-row'}>
      <dt>{label}</dt>
      <dd>
        {href ? <a href={href}>{value}</a> : <span className={multiline ? 'message-body' : undefined}>{value}</span>}
      </dd>
      <div className="detail-copy">
        <CopyButton value={value} label={label.toLowerCase()} />
      </div>
    </div>
  )
}
