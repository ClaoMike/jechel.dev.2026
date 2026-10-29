import { useState } from 'react'
import { ErrorState } from '@/shared/ui/ErrorState'
import { Loading, SkeletonTable } from '@/shared/ui/Skeleton'
import { Pagination } from '@/shared/ui/Pagination'
import { formatDateTime } from '@/shared/lib/format'
import { describeDevice, formatDuration } from '../../lib/format'
import { VisitDialog } from '../VisitDialog/VisitDialog'
import { useDeleteVisitMutation, useListVisitsQuery } from '../../api/analyticsApi'
import { usePagedQuery } from '@/shared/api'
import { strings } from '@/shared/i18n'

const VISITS_PAGE_SIZE = 20

/** Every visit, newest first, a page at a time (its own page number: not in the URL); a row opens its timeline. */
export function VisitsTable() {
  const [page, setPage] = useState(1)
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const { state, totalPages, retry } = usePagedQuery(useListVisitsQuery, { page, pageSize: VISITS_PAGE_SIZE, errorsOnly }, setPage)
  const [deleteVisit] = useDeleteVisitMutation()

  // The numbers and the list load again (store tags).
  async function deleteOpenVisit(id: string) {
    await deleteVisit(id).unwrap()
    setOpen(null)
  }

  return (
    <section className="card visits" aria-labelledby="visits-title">
      <div className="engagement-card-header">
        <h3 id="visits-title">{strings.common.visits}</h3>
        <label className="visits-filter">
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(event) => {
              setErrorsOnly(event.target.checked)
              setPage(1)
            }}
          />
          {strings.visitsTable.onlyVisitsErrors}
        </label>
      </div>

      {state.status === 'loading' && (
        <Loading label={strings.visitsTable.loadingVisits}>
          <SkeletonTable rows={6} columns={5} />
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message={strings.visitsTable.visitsCouldntLoaded} onRetry={retry} />}
      {state.status === 'loaded' && state.data.totalCount === 0 && <p className="muted">{errorsOnly ? strings.visitsTable.noVisitHasHit : strings.visitsTable.noVisitsYet}</p>}

      {state.status === 'loaded' && state.data.items.length > 0 && (
        <>
          <div className="table-scroll" role="region" aria-label={strings.visitsTable.visitsTable} tabIndex={0}>
            <table className="messages-table visits-table">
              <thead>
                <tr>
                  <th scope="col">{strings.visitsTable.started}</th>
                  <th scope="col">{strings.visitsTable.length}</th>
                  <th scope="col">{strings.visitsTable.pages}</th>
                  <th scope="col">{strings.visitsTable.device}</th>
                  <th scope="col">{strings.visitsTable.entryPage}</th>
                  <th scope="col">{strings.common.from}</th>
                  <th scope="col">{strings.common.errors}</th>
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
                    <td>{visit.referrerHost ?? strings.visitsTable.direct}</td>
                    <td>{visit.errorCount > 0 ? <span className="error-badge">{visit.errorCount}</span> : <span className="muted">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      {open && <VisitDialog visitId={open} onClose={() => setOpen(null)} onDelete={deleteOpenVisit} />}
    </section>
  )
}
