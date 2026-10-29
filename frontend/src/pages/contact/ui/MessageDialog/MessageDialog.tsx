import { useEffect, useId, useState, type FormEvent } from 'react'
import { CopyButton } from '@/shared/ui/CopyButton'
import { DeleteButton } from '@/shared/ui/DeleteButton'
import { TrashIcon } from '@/shared/ui/icons'
import { ErrorState } from '@/shared/ui/ErrorState'
import { Modal } from '@/shared/ui/Modal'
import { Loading, Skeleton, SkeletonText } from '@/shared/ui/Skeleton'
import { type ContactReply, failureOf } from '@/shared/api'
import { formatMeetingTime } from '../../lib/meetingFormat'
import { MeetingActions } from '../MeetingActions/MeetingActions'
import { formatDateTime } from '@/shared/lib/format'
import { useGetMessageQuery, useMarkMessageReadMutation, useReplyToMessageMutation } from '../../api/contactApi'
import { useGetBookingLinkQuery } from '../../api/meetingsApi'
import { toLoadable } from '@/shared/api'
import { INBOX_REFRESH_MS } from '../MessagesInbox/MessagesInbox'
import { strings } from '@/shared/i18n'

export interface MessageDialogProps {
  messageId: number
  /** The name from the list, shown while the details load. */
  name: string
  onClose: () => void
  /** Deletes the message on the server (after the admin confirms); the inbox then closes this. */
  onDelete: (id: number) => Promise<void>
}

/**
 * A message's details, each with a copy button. It's looked at again every minute while it's open (their emailed answer
 * joins it). Opening it marks the message as read (once it's loaded and still unread, which an answer that comes in makes
 * it again).
 */
export function MessageDialog({ messageId, name, onClose, onDelete }: MessageDialogProps) {
  const query = useGetMessageQuery(messageId, { pollingInterval: INBOX_REFRESH_MS })
  const state = toLoadable(query)
  const [markRead] = useMarkMessageReadMutation()
  const unread = state.status === 'loaded' && state.data.readAt === null

  useEffect(() => {
    // If it fails, it stays unread in the list; the next time it's opened tries again.
    if (unread) void markRead(messageId)
  }, [unread, messageId, markRead])
  const titleId = useId()

  return (
    <Modal labelledBy={titleId} onClose={onClose}>
      <div className="modal-header">
        <h2 id={titleId}>
          {strings.messageDialog.message}
          {state.status === 'loaded' ? state.data.name : name}
        </h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label={strings.common.close}>
          <span aria-hidden="true">×</span>
        </button>
      </div>

      {state.status === 'loading' && (
        <Loading label={strings.messageDialog.loadingMessage}>
          {[40, 55, 35].map((width, i) => (
            <div key={i} className="skeleton-text">
              <Skeleton width={70} height={11} />
              <Skeleton width={`${width}%`} height={16} />
            </div>
          ))}
          <SkeletonText lines={4} />
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message={strings.messageDialog.messageCouldntLoaded} onRetry={() => void query.refetch()} />}
      {state.status === 'loaded' && (
        <dl className="message-details">
          <DetailRow label={strings.common.name} value={state.data.name} />
          <DetailRow label={strings.common.email} value={state.data.email} href={`mailto:${state.data.email}`} />
          <DetailRow label={strings.messageDialog.received} value={formatDateTime(state.data.receivedAt)} />
          {state.data.subject && <DetailRow label={strings.messageDialog.subject} value={state.data.subject} />}
          <DetailRow label={strings.common.message} value={state.data.message} multiline />
        </dl>
      )}
      {state.status === 'loaded' && state.data.meetings.length > 0 && (
        <section className="message-meetings" aria-label={strings.messageDialog.meetingsTheyBooked}>
          <h3>{strings.messageDialog.meetingsTheyBooked}</h3>
          <ul className="meetings-list">
            {state.data.meetings.map((meeting) => (
              <li key={meeting.id} className="meeting">
                <p className="meeting-when">{formatMeetingTime(meeting)}</p>
                <p className="muted">{meeting.title}</p>
                {meeting.notes && <p className="meeting-notes">“{meeting.notes}”</p>}
                <MeetingActions meeting={meeting} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {state.status === 'loaded' && <Replies messageId={messageId} name={state.data.name} replies={state.data.replies} />}
      {state.status === 'loaded' && (
        <div className="message-actions">
          <DeleteButton
            what={strings.messageDialog.message3(state.data.name)}
            onDelete={() => onDelete(messageId)}
            className="button button-secondary button-small"
            label={strings.messageDialog.deleteMessage}
          >
            <TrashIcon size={16} />
            {strings.common.delete}
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
      <dd>{href ? <a href={href}>{value}</a> : <span className={multiline ? 'message-body' : undefined}>{value}</span>}</dd>
      {/* A second description, not a box of its own: a list of details holds only terms and descriptions (WCAG). */}
      <dd className="detail-copy">
        <CopyButton value={value} label={label.toLowerCase()} />
      </dd>
    </div>
  )
}

/**
 * The conversation after their first message, oldest first: your answers (emailed to them, from the site's address)
 * and what they emailed back. Then a box for the next answer.
 */
function Replies({ messageId, name, replies }: { messageId: number; name: string; replies: ContactReply[] }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [reply, { isLoading: busy }] = useReplyToMessageMutation()
  // Meetings are by invitation: the booking page goes out in an answer. None set (or not known yet): no button.
  const { data: bookingLink = '' } = useGetBookingLinkQuery()
  const id = useId()

  /** Adds the booking link on a line of its own at the end, once, and puts the cursor back in the box. */
  function addBookingLink() {
    if (!text.includes(bookingLink)) setText((current) => (current.trimEnd() ? `${current.trimEnd()}\n\n${bookingLink}` : bookingLink))
    setError('')
    document.getElementById(`${id}-text`)?.focus()
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!text.trim()) {
      setError(strings.messageDialog.writeReplyFirst)
      return
    }
    setError('')
    try {
      await reply({ id: messageId, text: text.trim() }).unwrap()
      setText('')
    } catch (e) {
      setError(failureOf(e).status === 503 ? strings.messageDialog.emailCouldntSentCheck : strings.common.didntWorkPleaseTry)
    }
  }

  return (
    <section className="message-replies" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{replies.length > 0 ? strings.messageDialog.conversation : strings.messageDialog.reply}</h3>
      {replies.length > 0 && (
        <ul className="replies-list">
          {replies.map((reply) => (
            <li key={reply.id} className={reply.fromVisitor ? 'reply reply-from-visitor' : 'reply'}>
              <p className="muted">
                <strong>{reply.fromVisitor ? name : strings.messageDialog.you}</strong> · <time dateTime={reply.sentAt}>{formatDateTime(reply.sentAt)}</time>
              </p>
              <p className="message-body">{reply.text}</p>
            </li>
          ))}
        </ul>
      )}
      <form className="reply-form" onSubmit={(event) => void send(event)} noValidate>
        <div className="field">
          <label htmlFor={`${id}-text`}>{replies.length > 0 ? strings.messageDialog.writeAgain(name) : strings.messageDialog.reply2(name)}</label>
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
              {strings.messageDialog.emailedThemTheirAnswer}
            </p>
          )}
        </div>
        <div className="reply-actions">
          <button type="submit" className="button button-small" disabled={busy}>
            {busy ? strings.common.sending : strings.messageDialog.sendReply}
          </button>
          {bookingLink && (
            <button type="button" className="button button-small button-secondary" onClick={addBookingLink} disabled={text.includes(bookingLink)}>
              {strings.messageDialog.addBookingLink}
            </button>
          )}
        </div>
      </form>
    </section>
  )
}
