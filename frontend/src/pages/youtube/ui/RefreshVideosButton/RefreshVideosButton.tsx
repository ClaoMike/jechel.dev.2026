import { useId, useEffect, useRef, useState } from 'react'
import { CopyButton } from '@/shared/ui/CopyButton'
import { CheckIcon, CloseIcon, RefreshIcon } from '@/shared/ui/icons'
import { Modal } from '@/shared/ui/Modal'
import { failureOf, type ApiFailure } from '@/shared/api'
import { useRefreshVideosMutation } from '@/entities/video'
import { strings } from '@/shared/i18n'

/** How long the green tick shows before the button is the refresh icon again. */
const DONE_FOR_MS = 2000

/** Where the button is: the refresh icon, spinning while it asks, then a tick (done) or a cross (failed, with the popup). */
export type RefreshPhase = 'idle' | 'busy' | 'done' | 'failed'

/** A failed refresh, for the popup: what it means, and the details to copy. */
export interface RefreshError {
  message: string
  report: string
}

/** What a failure means, in a sentence. */
function describeFailure({ status, problem }: ApiFailure): string {
  if (status === 0) return strings.refreshVideosButton.apiCouldntReachedCheck
  if (status === 401) return strings.refreshVideosButton.sessionHasEndedSign
  if (status === 503) return problem?.detail ?? strings.refreshVideosButton.youtubeCantReachedRight
  return strings.common.didntWorkPleaseTry
}

/** The details to copy, one per line, to look into the failure. */
function errorReport(failure: ApiFailure, at: Date): string {
  return [
    strings.refreshVideosButton.refreshYoutubeFailed,
    strings.refreshVideosButton.when(at.toISOString()),
    strings.refreshVideosButton.request(failure.request || 'POST /api/youtube/refresh'),
    strings.refreshVideosButton.status(failure.status || strings.refreshVideosButton.noAnswer),
    failure.problem?.detail && strings.refreshVideosButton.api(failure.problem.detail),
    failure.problem?.cause && strings.refreshVideosButton.cause(failure.problem.cause),
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * The admin's refresh, beside "Visit my YouTube page": fetches the videos now (e.g. right after an upload) instead of
 * within the hour. Its icon spins while it asks, then turns into a green tick, or a red cross and a popup with what went
 * wrong (closed only with its ×), to copy and look into.
 */
export function RefreshVideosButton() {
  // Asks YouTube for the videos now; the grid (and What's new?) load them again.
  const [refreshVideos] = useRefreshVideosMutation()
  const [phase, setPhase] = useState<RefreshPhase>('idle')
  const [announcement, setAnnouncement] = useState('')
  const [error, setError] = useState<RefreshError | null>(null)
  const back = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(back.current), [])

  async function refresh() {
    if (phase === 'busy' || error) return
    clearTimeout(back.current)
    setPhase('busy')
    setAnnouncement(strings.refreshVideosButton.refreshingYoutube)
    try {
      const count = await refreshVideos().unwrap()
      setPhase('done')
      setAnnouncement(strings.refreshVideosButton.upDateYoutube(count, count === 1 ? 'video' : 'videos'))
      back.current = setTimeout(() => setPhase('idle'), DONE_FOR_MS)
    } catch (caught) {
      const failure = failureOf(caught)
      setPhase('failed')
      setAnnouncement(strings.refreshVideosButton.couldntRefreshYoutube)
      setError({ message: describeFailure(failure), report: errorReport(failure, new Date()) })
    }
  }
  // Only its × closes the popup; the button is the refresh icon again.
  const closeError = () => {
    setError(null)
    setPhase('idle')
    setAnnouncement('')
  }
  const titleId = useId()

  return (
    <>
      <button
        type="button"
        className="icon-button refresh-button"
        data-phase={phase}
        aria-label={strings.refreshVideosButton.refreshYoutube}
        title={strings.refreshVideosButton.refreshYoutube}
        aria-busy={phase === 'busy'}
        onClick={() => void refresh()}
      >
        <span className="refresh-icon refresh-icon-refresh">
          <RefreshIcon size={18} />
        </span>
        <span className="refresh-icon refresh-icon-done">
          <CheckIcon size={18} />
        </span>
        <span className="refresh-icon refresh-icon-failed">
          <CloseIcon size={18} />
        </span>
      </button>
      <span className="visually-hidden refresh-status" role="status">
        {announcement}
      </span>

      {error && (
        <Modal labelledBy={titleId} onClose={closeError} dismissible={false} className="refresh-error">
          <div className="modal-header">
            <h2 id={titleId}>{strings.refreshVideosButton.couldntRefreshYoutube2}</h2>
            <button type="button" className="icon-button" onClick={closeError} aria-label={strings.common.close}>
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <p>{error.message}</p>
          <div className="error-report">
            <div className="error-report-header">
              <h3>{strings.refreshVideosButton.details}</h3>
              <CopyButton value={error.report} label={strings.refreshVideosButton.errorDetails} />
            </div>
            <pre>{error.report}</pre>
          </div>
        </Modal>
      )}
    </>
  )
}
