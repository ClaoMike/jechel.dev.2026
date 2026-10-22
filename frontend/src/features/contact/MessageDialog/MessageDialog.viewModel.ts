import { useEffect, useId, useState, type FormEvent } from 'react'
import { failureOf } from '../../../services/api'
import { useGetMessageQuery, useMarkMessageReadMutation, useReplyToMessageMutation } from '../../../store/api/contactApi'
import { useGetBookingLinkQuery } from '../../../store/api/meetingsApi'
import { toLoadable } from '../../../store/loadable'
import { INBOX_REFRESH_MS } from '../MessagesInbox/MessagesInbox.viewModel'

export interface MessageDialogProps {
  messageId: number
  /** The name from the list, shown while the details load. */
  name: string
  onClose: () => void
  /** Deletes the message on the server (after the admin confirms); the inbox then closes this. */
  onDelete: (id: number) => Promise<void>
}

/**
 * The message from the store, looked at again every minute while it's open (their emailed answer joins it); opening it
 * marks it as read (once it's loaded and still unread, which an answer that comes in makes it again).
 */
export function useMessageDialogViewModel({ messageId, name }: MessageDialogProps) {
  const query = useGetMessageQuery(messageId, { pollingInterval: INBOX_REFRESH_MS })
  const state = toLoadable(query)
  const [markRead] = useMarkMessageReadMutation()
  const unread = state.status === 'loaded' && state.data.readAt === null

  useEffect(() => {
    // If it fails, it stays unread in the list; the next time it's opened tries again.
    if (unread) void markRead(messageId)
  }, [unread, messageId, markRead])

  return { titleId: useId(), state, name: state.status === 'loaded' ? state.data.name : name, retry: () => void query.refetch() }
}

/** The answer being written, and sending it (emailed to the sender, with their message quoted). */
export function useRepliesViewModel(messageId: number) {
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
      setError('Write the reply first.')
      return
    }
    setError('')
    try {
      await reply({ id: messageId, text: text.trim() }).unwrap()
      setText('')
    } catch (e) {
      setError(failureOf(e).status === 503 ? "The email couldn't be sent: check Resend in Settings (its test shows why)." : "That didn't work. Please try again.")
    }
  }

  return {
    id,
    text,
    setText,
    error,
    busy,
    bookingLink,
    canAddBookingLink: bookingLink.length > 0 && !text.includes(bookingLink),
    addBookingLink,
    send: (event: FormEvent<HTMLFormElement>) => void send(event),
  }
}
