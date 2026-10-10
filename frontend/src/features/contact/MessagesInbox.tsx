import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { DeleteButton } from '../../components/DeleteButton'
import { api, type ContactMessageSummary, type Page } from '../../services/api'
import { formatDateTime } from '../../utils/formatDate'
import { MessageDialog } from './MessageDialog'

export const PAGE_SIZE = 10

type Result = { page: number } & ({ status: 'loaded'; data: Page<ContactMessageSummary> } | { status: 'error' })
type State = { status: 'loading' } | Result

/** The admin's inbox: messages from the contact form, newest first, 10 per page (?page=N). */
export function MessagesInbox() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  // The last response, and the page it belongs to: while it's for another page, that page is loading.
  const [result, setResult] = useState<Result | null>(null)
  const state: State = result && result.page === page ? result : { status: 'loading' }
  const [open, setOpen] = useState<ContactMessageSummary | null>(null)
  // Bumped after a delete, to load the page again (with the next message moved up, and the new total).
  const [reloads, setReloads] = useState(0)

  const goToPage = useCallback(
    (next: number) => setSearchParams(next === 1 ? {} : { page: String(next) }),
    [setSearchParams],
  )

  useEffect(() => {
    const controller = new AbortController()

    api.contact
      .listMessages(page, PAGE_SIZE, controller.signal)
      .then((data) => setResult({ status: 'loaded', page, data }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ status: 'error', page })
      })

    return () => controller.abort()
  }, [page, reloads])

  const totalPages = state.status === 'loaded' ? Math.max(1, Math.ceil(state.data.totalCount / PAGE_SIZE)) : 1

  // A stale link (e.g. ?page=9 after messages were deleted): show the last page instead.
  useEffect(() => {
    if (state.status === 'loaded' && page > totalPages) goToPage(totalPages)
  }, [state.status, page, totalPages, goToPage])

  const markRead = useCallback((id: number) => {
    setResult((current) =>
      current?.status === 'loaded'
        ? { ...current, data: { ...current.data, items: current.data.items.map((m) => (m.id === id ? { ...m, isRead: true } : m)) } }
        : current,
    )
  }, [])

  const deleteMessage = useCallback(async (id: number) => {
    await api.contact.deleteMessage(id)
    setOpen((current) => (current?.id === id ? null : current))
    setReloads((n) => n + 1)
  }, [])

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

      {state.status === 'loading' && <p>Loading messages…</p>}
      {state.status === 'error' && <p role="alert">Messages couldn't be loaded. Please try again later.</p>}
      {state.status === 'loaded' && state.data.totalCount === 0 && <p className="muted">No messages yet.</p>}

      {state.status === 'loaded' && state.data.items.length > 0 && (
        <>
          <table className="messages-table">
            <thead>
              <tr>
                <th scope="col" className="col-status">
                  <span className="visually-hidden">Status</span>
                </th>
                <th scope="col">Name</th>
                <th scope="col">Date received</th>
                <th scope="col" className="col-actions">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {state.data.items.map((message) => (
                <tr
                  key={message.id}
                  className={message.isRead ? 'message-row' : 'message-row message-row-unread'}
                  onClick={(event) => {
                    // The name button handles its own clicks (and keyboard); this makes the whole row clickable.
                    if (!(event.target as HTMLElement).closest('button')) setOpen(message)
                  }}
                >
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
                  </td>
                  <td>
                    <time dateTime={message.receivedAt}>{formatDateTime(message.receivedAt)}</time>
                  </td>
                  <td className="col-actions">
                    <DeleteButton what={`the message from ${message.name}`} onDelete={() => deleteMessage(message.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <nav className="pagination" aria-label="Pagination">
              <button type="button" className="button button-secondary" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button type="button" className="button button-secondary" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
                Next
              </button>
            </nav>
          )}
        </>
      )}

      {open && <MessageDialog messageId={open.id} name={open.name} onClose={() => setOpen(null)} onRead={markRead} onDelete={deleteMessage} />}
    </section>
  )
}
