import { DeleteButton } from '../../../components/DeleteButton/DeleteButton'
import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { Pagination } from '../../../components/Pagination'
import { Loading, SkeletonTable } from '../../../components/Skeleton'
import { formatDateTime } from '../../../utils/formatDate'
import { MessageDialog } from '../MessageDialog/MessageDialog'
import { useMessagesInboxViewModel } from './MessagesInbox.viewModel'

/** The admin's inbox: messages from the contact form, newest first, 10 per page (?page=N). */
export function MessagesInbox() {
  const vm = useMessagesInboxViewModel()
  const { state } = vm

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
      {state.status === 'error' && <ErrorState message="Messages couldn't be loaded." onRetry={vm.retry} />}
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
                  <tr key={message.id} className={message.isRead ? 'message-row' : 'message-row message-row-unread'} onClick={(event) => vm.rowClicked(event, message)}>
                    <td className="col-status">
                      {!message.isRead && (
                        <span className="unread-dot" title="Unread">
                          <span className="visually-hidden">Unread</span>
                        </span>
                      )}
                    </td>
                    <td>
                      <button type="button" className="link-button" onClick={() => vm.openMessage(message)}>
                        {message.name}
                      </button>
                    </td>
                    <td>
                      <time dateTime={message.lastActivityAt}>{formatDateTime(message.lastActivityAt)}</time>
                      {message.count > 1 && <span className="muted"> · {message.count} messages</span>}
                    </td>
                    <td className="col-actions">
                      <DeleteButton what={`the message from ${message.name}`} onDelete={() => vm.deleteMessage(message.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={vm.page} totalPages={vm.totalPages} onPageChange={vm.goToPage} />
        </>
      )}

      {vm.open && <MessageDialog messageId={vm.open.id} name={vm.open.name} onClose={vm.close} onDelete={vm.deleteMessage} />}
    </section>
  )
}
