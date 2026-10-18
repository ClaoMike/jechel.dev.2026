import { useEffect, useId, useState } from 'react'
import { CopyButton } from '../../components/CopyButton'
import { DeleteButton } from '../../components/DeleteButton'
import { TrashIcon } from '../../components/icons'
import { ErrorState } from '../../components/ErrorState'
import { Modal } from '../../components/Modal'
import { Loading, Skeleton, SkeletonText } from '../../components/Skeleton'
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
  /** Deletes the message on the server (after the admin confirms); the inbox then closes this. */
  onDelete: (id: number) => Promise<void>
}

/** A message's details, each with a copy button. Opening it marks the message as read. */
export function MessageDialog({ messageId, name, onClose, onRead, onDelete }: MessageDialogProps) {
  const titleId = useId()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [retries, setRetries] = useState(0)

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
  }, [messageId, onRead, retries])

  return (
    <Modal labelledBy={titleId} onClose={onClose}>
      <header className="modal-header">
        <h2 id={titleId}>Message from {state.status === 'loaded' ? state.message.name : name}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
      </header>

      {state.status === 'loading' && (
        <Loading label="Loading the message…">
          {[40, 55, 35].map((width, i) => (
            <div key={i} className="skeleton-text">
              <Skeleton width={70} height={11} />
              <Skeleton width={`${width}%`} height={16} />
            </div>
          ))}
          <SkeletonText lines={4} />
        </Loading>
      )}
      {state.status === 'error' && (
        <ErrorState
          message="This message couldn't be loaded."
          onRetry={() => {
            setState({ status: 'loading' })
            setRetries((n) => n + 1)
          }}
        />
      )}
      {state.status === 'loaded' && (
        <dl className="message-details">
          <DetailRow label="Name" value={state.message.name} />
          <DetailRow label="Email" value={state.message.email} href={`mailto:${state.message.email}`} />
          <DetailRow label="Received" value={formatDateTime(state.message.receivedAt)} />
          <DetailRow label="Message" value={state.message.message} multiline />
        </dl>
      )}
      {state.status === 'loaded' && (
        <div className="message-actions">
          <DeleteButton what={`the message from ${state.message.name}`} onDelete={() => onDelete(messageId)} className="button button-secondary button-small" label="Delete message">
            <TrashIcon size={16} />
            Delete
          </DeleteButton>
        </div>
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
