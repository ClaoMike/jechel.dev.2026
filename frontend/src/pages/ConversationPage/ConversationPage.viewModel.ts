import { useId, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { failureOf } from '../../services/api'
import { trackEvent } from '../../features/analytics'
import { useGetConversationQuery, useWriteBackMutation } from '../../store/api/contactApi'

/** At most this many characters in one message back (as the API: ContactEndpoints.WriteBackMaxLength). */
export const WRITE_BACK_MAX_LENGTH = 2000

export type ConversationState = 'loading' | 'loaded' | 'unknown' | 'error'

/**
 * The visitor's conversation, opened from the link in an answer's email: every message, and a box to write
 * back. A link that matches no conversation (deleted, or cut short by a mail app) says so.
 */
export function useConversationPageViewModel() {
  const token = useSearchParams()[0].get('token')?.trim() ?? ''
  const query = useGetConversationQuery(token, { skip: !token })
  const [writeBack, { isLoading: sending }] = useWriteBackMutation()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const status: ConversationState = !token ? 'unknown' : query.data ? 'loaded' : query.isError ? (failureOf(query.error).status === 404 ? 'unknown' : 'error') : 'loading'

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSent(false)
    const message = text.trim()
    if (!message) {
      setError('Write your message first.')
      return
    }
    setError('')
    try {
      await writeBack({ token, text: message }).unwrap()
      setText('')
      setSent(true)
      trackEvent('Wrote back in a conversation')
    } catch (e) {
      const { status: code, validationErrors } = failureOf(e)
      trackEvent('Writing back failed', { reason: validationErrors?.text ? 'invalid' : code === 429 ? 'too many tries' : String(code || 'no response') })
      setError(
        validationErrors?.text?.[0] ??
          (code === 429
            ? 'Too many messages in a short while. Please try again in a few minutes.'
            : code === 404
              ? "This conversation isn't there any more."
              : "That didn't work. Please try again."),
      )
    }
  }

  return {
    id: useId(),
    status,
    conversation: query.data ?? null,
    retry: () => void query.refetch(),
    text,
    // Typing again clears what was said about the last try.
    setText: (value: string) => {
      setText(value)
      setSent(false)
      setError('')
    },
    error,
    sent,
    sending,
    send: (event: FormEvent<HTMLFormElement>) => void send(event),
  }
}
