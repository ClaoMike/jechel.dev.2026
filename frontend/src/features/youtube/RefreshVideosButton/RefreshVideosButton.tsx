import { useId, useEffect, useRef, useState } from 'react'
import { CopyButton } from '../../../components/CopyButton/CopyButton'
import { CheckIcon, CloseIcon, RefreshIcon } from '../../../components/icons/icons'
import { Modal } from '../../../components/Modal/Modal'
import { failureOf, type ApiFailure } from '../../../services/api'
import { useRefreshVideosMutation } from '../../../store/api/appsApi'

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
  if (status === 0) return "The API couldn't be reached. Check the connection, then try again."
  if (status === 401) return 'Your session has ended. Sign in again, then refresh.'
  if (status === 503) return problem?.detail ?? "YouTube can't be reached right now, or isn't set up (Settings). The videos shown are the last ones saved."
  return "That didn't work. Please try again."
}

/** The details to copy, one per line, to look into the failure. */
function errorReport(failure: ApiFailure, at: Date): string {
  return [
    'Refresh from YouTube failed',
    `When: ${at.toISOString()}`,
    `Request: ${failure.request || 'POST /api/youtube/refresh'}`,
    `Status: ${failure.status || 'no answer'}`,
    failure.problem?.detail && `API: ${failure.problem.detail}`,
    failure.problem?.cause && `Cause: ${failure.problem.cause}`,
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
    setAnnouncement('Refreshing from YouTube…')
    try {
      const count = await refreshVideos().unwrap()
      setPhase('done')
      setAnnouncement(`Up to date: ${count} ${count === 1 ? 'video' : 'videos'} on YouTube.`)
      back.current = setTimeout(() => setPhase('idle'), DONE_FOR_MS)
    } catch (caught) {
      const failure = failureOf(caught)
      setPhase('failed')
      setAnnouncement("Couldn't refresh from YouTube.")
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
        aria-label="Refresh from YouTube"
        title="Refresh from YouTube"
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
            <h2 id={titleId}>Couldn't refresh from YouTube</h2>
            <button type="button" className="icon-button" onClick={closeError} aria-label="Close">
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <p>{error.message}</p>
          <div className="error-report">
            <div className="error-report-header">
              <h3>Details</h3>
              <CopyButton value={error.report} label="the error details" />
            </div>
            <pre>{error.report}</pre>
          </div>
        </Modal>
      )}
    </>
  )
}
