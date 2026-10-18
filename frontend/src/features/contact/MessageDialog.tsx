import { useEffect, useId, useState, type FormEvent } from 'react'
import { CopyButton } from '../../components/CopyButton'
import { DeleteButton } from '../../components/DeleteButton'
import { TrashIcon } from '../../components/icons'
import { ErrorState } from '../../components/ErrorState'
import { Modal } from '../../components/Modal'
import { Loading, Skeleton, SkeletonText } from '../../components/Skeleton'
import { api, ApiError, type ContactMessageDetails, type Meeting } from '../../services/api'
import { formatMeetingTime } from '../meetings/format'
import { MeetingActions } from '../meetings/MeetingActions'
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
      // An older API (mid-deploy) has no replies or meetings yet.
      setState({ status: 'loaded', message: { ...message, replies: message.replies ?? [], meetings: message.meetings ?? [] } })

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
      <div className="modal-header">
        <h2 id={titleId}>Message from {state.status === 'loaded' ? state.message.name : name}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
      </div>

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
      {state.status === 'loaded' && state.message.meetings.length > 0 && (
        <section className="message-meetings" aria-label="Meetings they booked">
          <h3>Meetings they booked</h3>
          <ul className="meetings-list">
            {state.message.meetings.map((meeting) => (
              <li key={meeting.id} className="meeting">
                <p className="meeting-when">{formatMeetingTime(meeting)}</p>
                <p className="muted">{meeting.title}</p>
                {meeting.notes && <p className="meeting-notes">“{meeting.notes}”</p>}
                <MeetingActions
                  meeting={meeting}
                  onDecided={(status) =>
                    setState((current) =>
                      current.status === 'loaded'
                        ? { ...current, message: { ...current.message, meetings: current.message.meetings.map((m: Meeting) => (m.id === meeting.id ? { ...m, status } : m)) } }
                        : current,
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {state.status === 'loaded' && (
        <Replies
          messageId={messageId}
          name={state.message.name}
          replies={state.message.replies}
          onSent={(reply) => setState((current) => (current.status === 'loaded' ? { ...current, message: { ...current.message, replies: [...current.message.replies, reply] } } : current))}
        />
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

/** The answers sent so far, and a box for another: emailed to the sender, with their message quoted. */
function Replies({ messageId, name, replies, onSent }: { messageId: number; name: string; replies: ContactMessageDetails['replies']; onSent: (reply: ContactMessageDetails['replies'][number]) => void }) {
  const id = useId()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!text.trim()) {
      setError('Write the reply first.')
      return
    }
    setBusy(true)
    setError('')
    try {
      onSent(await api.contact.reply(messageId, text.trim()))
      setText('')
    } catch (e) {
      setError(e instanceof ApiError && e.status === 503 ? "The email couldn't be sent: check Resend in Settings (its test shows why)." : "That didn't work. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="message-replies" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{replies.length > 0 ? 'Your replies' : 'Reply'}</h3>
      {replies.length > 0 && (
        <ul className="replies-list">
          {replies.map((reply) => (
            <li key={reply.id} className="reply">
              <p className="muted">
                <time dateTime={reply.sentAt}>{formatDateTime(reply.sentAt)}</time>
              </p>
              <p className="message-body">{reply.text}</p>
            </li>
          ))}
        </ul>
      )}
      <form className="reply-form" onSubmit={(e) => void send(e)} noValidate>
        <div className="field">
          <label htmlFor={`${id}-text`}>{replies.length > 0 ? `Write to ${name} again` : `Reply to ${name}`}</label>
          <textarea
            id={`${id}-text`}
            rows={4}
            value={text}
            maxLength={5000}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : `${id}-hint`}
          />
          {error ? (
            <p id={`${id}-error`} className="field-error" role="alert">
              {error}
            </p>
          ) : (
            <p id={`${id}-hint`} className="field-hint">
              Emailed to them with their message quoted; their answer comes to your own inbox.
            </p>
          )}
        </div>
        <button type="submit" className="button button-small" disabled={busy}>
          {busy ? 'Sending…' : 'Send reply'}
        </button>
      </form>
    </section>
  )
}
