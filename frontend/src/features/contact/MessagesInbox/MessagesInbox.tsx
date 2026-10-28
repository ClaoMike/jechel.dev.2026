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
        <h2 id="inbox-title">Messages</h2>
        {state.status === 'loaded' && (
          <span className="muted">
            {state.data.totalCount} {state.data.totalCount === 1 ? 'message' : 'messages'}
          </span>
        )}
      </div>

      {state.status === 'loading' && (
        <Loading label="Loading messages…">
          <SkeletonTable rows={5} columns={3} />
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message="Messages couldn't be loaded." onRetry={retry} />}
      {state.status === 'loaded' && state.data.totalCount === 0 && <p className="muted">No messages yet.</p>}

      {state.status === 'loaded' && state.data.items.length > 0 && (
        <>
          {/* Narrow screens scroll the table sideways inside the card, rather than the page. */}
          <div className="table-scroll" role="region" aria-label="Messages table" tabIndex={0}>
            <table className="messages-table">
              <thead>
                <tr>
                  <th scope="col" className="col-status">
                    <span className="visually-hidden">Status</span>
                  </th>
                  <th scope="col">Name</th>
                  <th scope="col">Last message</th>
                  <th scope="col" className="col-actions">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((message) => (
                  <tr key={message.id} className={message.isRead ? 'message-row' : 'message-row message-row-unread'} onClick={(event) => rowClicked(event, message)}>
                    <td className="col-status">
                      {!message.isRead && (
                        <span className="unread-dot" title="Unread">
                          <span className="visually-hidden">Unread</span>
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
                          <span className="chip chip-project">Project enquiry</span>
                        </>
                      )}
                    </td>
                    <td>
                      <time dateTime={message.lastActivityAt}>{formatDateTime(message.lastActivityAt)}</time>
                      {message.count > 1 && <span className="muted"> · {message.count} messages</span>}
                    </td>
                    <td className="col-actions">
                      <DeleteButton what={`the message from ${message.name}`} onDelete={() => deleteMessage(message.id)} />
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
