import { useState, type MouseEvent } from 'react'
import { DeleteButton } from '../../../components/DeleteButton/DeleteButton'
import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { Pagination } from '../../../components/Pagination'
import { Loading, SkeletonTable } from '../../../components/Skeleton'
import { formatDateTime } from '../../../utils/formatDate'
import { MessageDialog } from '../MessageDialog/MessageDialog'
import { PROJECT_ENQUIRY } from '../contactRules'
import { usePageParam } from '../../../components/usePageParam'
import type { ContactMessageSummary } from '../../../services/api'
import { useDeleteMessageMutation, useListMessagesQuery } from '../../../store/api/contactApi'
import { usePagedQuery } from '../../../store/usePagedQuery'
import { strings } from '../../../strings'

export const PAGE_SIZE = 10

/** Emails come in at any time: the inbox looks again every minute while it's open. */
export const INBOX_REFRESH_MS = 60_000

/** The admin's inbox: messages from the contact form, newest first, 10 per page (?page=N). */
export function MessagesInbox() {
  // The page of messages (?page=N), the one that's open, and deleting.
  const [page, goToPage] = usePageParam()
  const { state, totalPages, retry } = usePagedQuery(useListMessagesQuery, { page, pageSize: PAGE_SIZE }, goToPage, { pollingInterval: INBOX_REFRESH_MS })
  const [open, setOpen] = useState<ContactMessageSummary | null>(null)
  const [removeMessage] = useDeleteMessageMutation()
  // The name button handles its own clicks (and keyboard); this makes the whole row clickable.
  const rowClicked = (event: MouseEvent, message: ContactMessageSummary) => {
    if (!(event.target as HTMLElement).closest('button')) setOpen(message)
  }
  const close = () => setOpen(null)
  const deleteMessage = async (id: number) => {
    await removeMessage(id).unwrap()
    setOpen((current) => (current?.id === id ? null : current))
  }

  return (
    <section className="card inbox" aria-labelledby="inbox-title">
      <div className="inbox-header">
        <h2 id="inbox-title">{strings.messagesInbox.messages}</h2>
        {state.status === 'loaded' && <span className="muted">{strings.messagesInbox.count(state.data.totalCount)}</span>}
      </div>

      {state.status === 'loading' && (
        <Loading label={strings.messagesInbox.loadingMessages}>
          <SkeletonTable rows={5} columns={3} />
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message={strings.messagesInbox.messagesCouldntLoaded} onRetry={retry} />}
      {state.status === 'loaded' && state.data.totalCount === 0 && <p className="muted">{strings.messagesInbox.noMessagesYet}</p>}

      {state.status === 'loaded' && state.data.items.length > 0 && (
        <>
          {/* Narrow screens scroll the table sideways inside the card, rather than the page. */}
          <div className="table-scroll" role="region" aria-label={strings.messagesInbox.messagesTable} tabIndex={0}>
            <table className="messages-table">
              <thead>
                <tr>
                  <th scope="col" className="col-status">
                    <span className="visually-hidden">{strings.common.status}</span>
                  </th>
                  <th scope="col">{strings.common.name}</th>
                  <th scope="col">{strings.messagesInbox.lastMessage}</th>
                  <th scope="col" className="col-actions">
                    <span className="visually-hidden">{strings.messagesInbox.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((message) => (
                  <tr key={message.id} className={message.isRead ? 'message-row' : 'message-row message-row-unread'} onClick={(event) => rowClicked(event, message)}>
                    <td className="col-status">
                      {!message.isRead && (
                        <span className="unread-dot" title={strings.messagesInbox.unread}>
                          <span className="visually-hidden">{strings.messagesInbox.unread}</span>
                        </span>
                      )}
                    </td>
                    <td>
                      <button type="button" className="link-button" onClick={() => setOpen(message)}>
                        {message.name}
                      </button>
                      {message.subject === PROJECT_ENQUIRY && (
                        <>
                          {' '}
                          <span className="chip chip-project">{strings.messagesInbox.projectEnquiry}</span>
                        </>
                      )}
                    </td>
                    <td>
                      <time dateTime={message.lastActivityAt}>{formatDateTime(message.lastActivityAt)}</time>
                      {message.count > 1 && (
                        <span className="muted">
                          {' '}
                          · {message.count} {strings.messagesInbox.messages2}
                        </span>
                      )}
                    </td>
                    <td className="col-actions">
                      <DeleteButton what={strings.messagesInbox.message(message.name)} onDelete={() => deleteMessage(message.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} />
        </>
      )}

      {open && <MessageDialog messageId={open.id} name={open.name} onClose={close} onDelete={deleteMessage} />}
    </section>
  )
}
