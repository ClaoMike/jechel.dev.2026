import { useId } from 'react'
import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { Loading, SkeletonChips, SkeletonList } from '../../../components/Skeleton'
import { CopyButton } from '../../../components/CopyButton/CopyButton'
import { DeleteButton } from '../../../components/DeleteButton/DeleteButton'
import { TrashIcon } from '../../../components/icons/icons'
import { Modal } from '../../../components/Modal/Modal'
import type { VisitDetails } from '../../../services/api'
import { describeDevice, describeEvent, describeTheme, formatDuration, formatOffset, reproductionSteps } from '../format'
import { useGetVisitQuery } from '../../../store/api/analyticsApi'
import { toLoadable } from '../../../store/loadable'
import { formatDateTime } from '../../../utils/formatDate'

/**
 * A visit replayed: what it ran on, then every step in order with its time. Errors open up to their
 * stack. "Copy steps" gives it all as text, to reproduce the problem (or hand it to an AI).
 */
export function VisitDialog({ visitId, onClose, onDelete }: { visitId: string; onClose: () => void; onDelete: (id: string) => Promise<void> }) {
  const query = useGetVisitQuery(visitId)
  const state = toLoadable(query)
  const titleId = useId()

  return (
    <Modal labelledBy={titleId} onClose={onClose} className="modal-wide">
      <div className="modal-header">
        <h2 id={titleId}>{state.status === 'loaded' ? `Visit on ${formatDateTime(state.data.startedAt)}` : 'Visit'}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
      </div>

      {state.status === 'loading' && (
        <Loading label="Loading the visit…">
          <SkeletonChips count={5} />
          <SkeletonList rows={8} pill />
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message="This visit couldn't be loaded." onRetry={() => void query.refetch()} />}
      {state.status === 'loaded' && <VisitView visit={state.data} onDelete={() => onDelete(visitId)} />}
    </Modal>
  )
}

function VisitView({ visit, onDelete }: { visit: VisitDetails; onDelete: () => Promise<void> }) {
  const from = visit.referrer ?? (visit.utmSource ? `utm_source=${visit.utmSource}` : 'Direct')
  return (
    <>
      <dl className="visit-facts">
        <Fact label="Device" value={describeDevice(visit)} />
        <Fact label="Window" value={`${visit.viewportWidth}×${visit.viewportHeight} (screen ${visit.screenWidth}×${visit.screenHeight})`} />
        <Fact label="Theme" value={describeTheme(visit)} />
        <Fact label="Length" value={formatDuration((Date.parse(visit.lastSeenAt) - Date.parse(visit.startedAt)) / 1000)} />
        <Fact label="Came from" value={from} />
        <Fact label="Where" value={[visit.country, visit.timeZone, visit.language].filter(Boolean).join(' · ') || '—'} />
      </dl>

      <div className="visit-actions">
        <span className="visit-copy">
          <CopyButton value={reproductionSteps(visit)} label="steps to reproduce" />
          Copy steps to reproduce
        </span>
        <DeleteButton what="this visit" onDelete={onDelete} className="button button-secondary button-small" label="Delete visit">
          <TrashIcon size={16} />
          Delete
        </DeleteButton>
      </div>

      <ol className="visit-timeline" aria-label="What happened">
        {visit.events.map((event) => (
          <li key={event.seq} className={`visit-step visit-step-${event.type}`}>
            <time className="visit-step-time" dateTime={event.occurredAt}>
              {formatOffset(visit.startedAt, event.occurredAt)}
            </time>
            <div className="visit-step-body">
              <span className="visit-step-text">{describeEvent(event)}</span>
              {event.type !== 'pageview' && <span className="visit-step-path">{event.path}</span>}
              {event.type === 'error' && event.detail && (
                <details className="visit-step-detail">
                  <summary>Details</summary>
                  <dl>
                    {Object.entries(event.detail).map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>
                          <pre>{value}</pre>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="muted visit-agent">{visit.userAgent}</p>
    </>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
