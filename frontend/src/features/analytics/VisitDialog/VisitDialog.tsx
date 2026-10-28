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
import { strings } from '../../../strings'

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
        <h2 id={titleId}>{state.status === 'loaded' ? strings.visitDialog.visit(formatDateTime(state.data.startedAt)) : strings.visitDialog.visit2}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label={strings.common.close}>
          <span aria-hidden="true">×</span>
        </button>
      </div>

      {state.status === 'loading' && (
        <Loading label={strings.visitDialog.loadingVisit}>
          <SkeletonChips count={5} />
          <SkeletonList rows={8} pill />
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message={strings.visitDialog.visitCouldntLoaded} onRetry={() => void query.refetch()} />}
      {state.status === 'loaded' && <VisitView visit={state.data} onDelete={() => onDelete(visitId)} />}
    </Modal>
  )
}

function VisitView({ visit, onDelete }: { visit: VisitDetails; onDelete: () => Promise<void> }) {
  const from = visit.referrer ?? (visit.utmSource ? `utm_source=${visit.utmSource}` : strings.visitDialog.direct)
  return (
    <>
      <dl className="visit-facts">
        <Fact label={strings.visitDialog.device} value={describeDevice(visit)} />
        <Fact label={strings.visitDialog.window} value={`${visit.viewportWidth}×${visit.viewportHeight} (screen ${visit.screenWidth}×${visit.screenHeight})`} />
        <Fact label={strings.visitDialog.theme} value={describeTheme(visit)} />
        <Fact label={strings.visitDialog.length} value={formatDuration((Date.parse(visit.lastSeenAt) - Date.parse(visit.startedAt)) / 1000)} />
        <Fact label={strings.visitDialog.came} value={from} />
        <Fact label={strings.visitDialog.where} value={[visit.country, visit.timeZone, visit.language].filter(Boolean).join(' · ') || '—'} />
      </dl>

      <div className="visit-actions">
        <span className="visit-copy">
          <CopyButton value={reproductionSteps(visit)} label={strings.visitDialog.stepsReproduce} />
          {strings.visitDialog.copyStepsReproduce}
        </span>
        <DeleteButton what={strings.visitDialog.visit3} onDelete={onDelete} className="button button-secondary button-small" label={strings.visitDialog.deleteVisit}>
          <TrashIcon size={16} />
          {strings.common.delete}
        </DeleteButton>
      </div>

      <ol className="visit-timeline" aria-label={strings.visitDialog.whatHappened}>
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
                  <summary>{strings.visitDialog.details}</summary>
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
