import { Link } from 'react-router'
import { ErrorState } from '../../components/ErrorState/ErrorState'
import { Loading, Skeleton, SkeletonText } from '../../components/Skeleton'
import { formatDateTime } from '../../utils/formatDate'
import { useConversationPageViewModel, WRITE_BACK_MAX_LENGTH } from './ConversationPage.viewModel'

/**
 * Where "Reply on jechel.dev" in an answer's email lands (/contact/conversation?token=…): the visitor's
 * messages and Claudiu's, oldest first, and a box to write back (text only). Works while the Contact page
 * is hidden and during maintenance: the link is all it needs.
 */
export function ConversationPage() {
  const vm = useConversationPageViewModel()
  const { id, conversation } = vm

  return (
    <section className="card conversation" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Your conversation with Claudiu</h2>

      {vm.status === 'loading' && (
        <Loading label="Loading the conversation…">
          <Skeleton width={140} height={12} />
          <SkeletonText lines={3} />
          <Skeleton width={110} height={12} />
          <SkeletonText lines={2} />
        </Loading>
      )}
      {vm.status === 'unknown' && (
        <>
          <p role="alert">This link isn't valid any more. Write again from the Contact page.</p>
          <Link to="/contact" className="button button-secondary">
            Contact
          </Link>
        </>
      )}
      {vm.status === 'error' && <ErrorState message="The conversation couldn't be loaded." onRetry={vm.retry} />}

      {conversation && (
        <>
          <ol className="conversation-messages" aria-label="Messages, oldest first">
            {conversation.messages.map((message, i) => (
              <li key={i} className="conversation-message" data-from={message.fromVisitor ? 'visitor' : 'admin'}>
                <p className="conversation-who">
                  <strong>{message.fromVisitor ? 'You' : 'Claudiu'}</strong>
                  <time className="muted" dateTime={message.at}>
                    {formatDateTime(message.at)}
                  </time>
                </p>
                <p className="message-body">{message.text}</p>
              </li>
            ))}
          </ol>

          <form className="conversation-form" onSubmit={vm.send} noValidate>
            <div className="field">
              <label htmlFor={`${id}-text`}>Write back</label>
              <textarea
                id={`${id}-text`}
                rows={4}
                value={vm.text}
                maxLength={WRITE_BACK_MAX_LENGTH}
                onChange={(e) => vm.setText(e.target.value)}
                aria-invalid={vm.error ? true : undefined}
                aria-describedby={vm.error ? `${id}-error` : undefined}
              />
              {vm.error && (
                <p id={`${id}-error`} className="field-error" role="alert">
                  {vm.error}
                </p>
              )}
            </div>
            <div className="conversation-actions">
              <button type="submit" className="button" disabled={vm.sending}>
                {vm.sending ? 'Sending…' : 'Send'}
              </button>
              {vm.sent && (
                <p role="status" className="settings-ok">
                  Sent. You'll get an email when Claudiu answers.
                </p>
              )}
            </div>
          </form>
        </>
      )}
    </section>
  )
}
