import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { Loading, SkeletonTable } from '../../../components/Skeleton'
import { Pagination } from '../../../components/Pagination'
import { formatDateTime } from '../../../utils/formatDate'
import { describeDevice, formatDuration } from '../format'
import { VisitDialog } from '../VisitDialog/VisitDialog'
import { useVisitsTableViewModel } from './VisitsTable.viewModel'

/** Every visit, newest first; a row opens its timeline. */
export function VisitsTable() {
  const vm = useVisitsTableViewModel()
  const { state, errorsOnly } = vm

  return (
    <section className="card visits" aria-labelledby="visits-title">
      <div className="engagement-card-header">
        <h3 id="visits-title">Visits</h3>
        <label className="visits-filter">
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(event) => vm.setErrorsOnly(event.target.checked)}
          />
          Only visits with errors
        </label>
      </div>

      {state.status === 'loading' && (
        <Loading label="Loading visits…">
          <SkeletonTable rows={6} columns={5} />
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message="Visits couldn't be loaded." onRetry={vm.retry} />}
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
                    onClick={(event) => vm.rowClicked(event, visit.id)}
                  >
                    <td>
                      <button type="button" className="link-button" onClick={() => vm.openVisit(visit.id)}>
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
          <Pagination page={vm.page} totalPages={vm.totalPages} onPageChange={vm.setPage} />
        </>
      )}

      {vm.open && <VisitDialog visitId={vm.open} onClose={vm.close} onDelete={vm.deleteVisit} />}
    </section>
  )
}
