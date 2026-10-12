import { useCallback, useEffect, useState } from 'react'
import { Pagination } from '../../components/Pagination'
import { api, type Page, type VisitSummary } from '../../services/api'
import { formatDateTime } from '../../utils/formatDate'
import { describeDevice, formatDuration } from './format'
import { VisitDialog } from './VisitDialog'

export const VISITS_PAGE_SIZE = 20

type Result = { key: string } & ({ status: 'loaded'; data: Page<VisitSummary> } | { status: 'error' })
type State = { status: 'loading' } | Result

/** Every visit, newest first; a row opens its timeline. `onChange` runs after a visit is deleted. */
export function VisitsTable({ reloadKey, onChange }: { reloadKey: number; onChange: () => void }) {
  const [page, setPage] = useState(1)
  const [errorsOnly, setErrorsOnly] = useState(false)
  // The last response and what it was for: while that's not what's asked now, it's loading.
  const key = `${page}|${errorsOnly}|${reloadKey}`
  const [result, setResult] = useState<Result | null>(null)
  const state: State = result && result.key === key ? result : { status: 'loading' }
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    api.analytics
      .listSessions(page, VISITS_PAGE_SIZE, errorsOnly, controller.signal)
      .then((data) => setResult({ key, status: 'loaded', data }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, status: 'error' })
      })
    return () => controller.abort()
  }, [key, page, errorsOnly])

  const deleteVisit = useCallback(
    async (id: string) => {
      await api.analytics.deleteSession(id)
      setOpen(null)
      onChange()
    },
    [onChange],
  )

  const totalPages = state.status === 'loaded' ? Math.max(1, Math.ceil(state.data.totalCount / VISITS_PAGE_SIZE)) : 1

  return (
    <section className="card visits" aria-labelledby="visits-title">
      <div className="engagement-card-header">
        <h3 id="visits-title">Visits</h3>
        <label className="visits-filter">
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(event) => {
              setErrorsOnly(event.target.checked)
              setPage(1)
            }}
          />
          Only visits with errors
        </label>
      </div>

      {state.status === 'loading' && <p>Loading visits…</p>}
      {state.status === 'error' && <p role="alert">Visits couldn't be loaded. Please try again later.</p>}
      {state.status === 'loaded' && state.data.totalCount === 0 && <p className="muted">{errorsOnly ? 'No visit has hit an error.' : 'No visits yet.'}</p>}

      {state.status === 'loaded' && state.data.items.length > 0 && (
        <>
          <div className="table-scroll" role="region" aria-label="Visits table" tabIndex={0}>
            <table className="messages-table visits-table">
              <thead>
                <tr>
                  <th scope="col">Started</th>
                  <th scope="col">Length</th>
                  <th scope="col">Pages</th>
                  <th scope="col">Device</th>
                  <th scope="col">Entry page</th>
                  <th scope="col">From</th>
                  <th scope="col">Errors</th>
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((visit) => (
                  <tr
                    key={visit.id}
                    className="message-row"
                    onClick={(event) => {
                      if (!(event.target as HTMLElement).closest('button')) setOpen(visit.id)
                    }}
                  >
                    <td>
                      <button type="button" className="link-button" onClick={() => setOpen(visit.id)}>
                        <time dateTime={visit.startedAt}>{formatDateTime(visit.startedAt)}</time>
                      </button>
                    </td>
                    <td>{formatDuration(visit.durationSeconds)}</td>
                    <td>{visit.pageViews}</td>
                    <td>{describeDevice(visit)}</td>
                    <td className="visits-path">{visit.entryPath}</td>
                    <td>{visit.referrerHost ?? 'Direct'}</td>
                    <td>{visit.errorCount > 0 ? <span className="error-badge">{visit.errorCount}</span> : <span className="muted">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      {open && <VisitDialog visitId={open} onClose={() => setOpen(null)} onDelete={deleteVisit} />}
    </section>
  )
}
