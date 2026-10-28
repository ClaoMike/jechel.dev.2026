import { useEffect, useRef, useMemo, useState } from 'react'
import { skipToken } from '@reduxjs/toolkit/query'
import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { TextField } from '../../../components/fields'
import { PencilIcon } from '../../../components/icons/icons'
import { Loading, Skeleton } from '../../../components/Skeleton'
import { UPDATE_EMAIL_KINDS, type UpdateEmailKind, type UpdateEmailWording, type TestResult } from '../../../services/api'
import { formatDateTime } from '../../../utils/formatDate'
import {
  usePreviewUpdateEmailQuery,
  useGetUpdateEmailsQuery,
  useResetUpdateEmailsMutation,
  useSaveUpdateEmailsMutation,
  useTestUpdateEmailMutation,
} from '../../../store/api/communityApi'
import { toLoadable } from '../../../store/loadable'
import { fieldErrorsOf, saveFailedMessage, type FieldErrors } from '../../../utils/saveErrors'

/** How long typing pauses before the preview follows. */
const PREVIEW_DELAY_MS = 400

/** Until the email inside has loaded and been measured. */
const DEFAULT_FRAME_HEIGHT = 560

const KIND_NAMES: Record<UpdateEmailKind, string> = { confirm: 'Confirmation', video: 'New video', app: 'New app' }

const same = (a: UpdateEmailWording, b: UpdateEmailWording) => JSON.stringify(a) === JSON.stringify(b)

/** The value, once it has stopped changing for `delay` ms; the first one at once. */
function useSettled<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value)
  const first = settled === null
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), first ? 0 : delay)
    return () => clearTimeout(timer)
  }, [value, delay, first])
  return settled
}

/** The preview of the wording from the API, following it once typing pauses; `catchingUp` until it has. */
function useSettledPreview(kind: UpdateEmailKind, wording: UpdateEmailWording | null) {
  const current = useMemo(() => wording && { kind, wording }, [kind, wording])
  const shown = useSettled(current, PREVIEW_DELAY_MS)
  return { preview: usePreviewUpdateEmailQuery(shown ?? skipToken), catchingUp: shown !== current }
}

/**
 * The emails subscribers get, in the admin's words (Community tab): one email at a time, its preview under
 * glass (to look at, not to click). Edit brings up the same four fields for each beside the preview, which
 * follows them; Save keeps the changes, Cancel throws them away. A test of the draft goes to the admin's own inbox.
 */
export function UpdateEmailsEditor() {
  // The admin's wording of the emails subscribers get: the preview of each of the three from the API (the same code
  // that sends them, under glass: only to look at); Edit brings up the fields, and the preview follows the draft of all
  // three, saved as a whole with Save or thrown away with Cancel. A test of the draft is sent to the admin. Saving the
  // defaults unchanged goes back to them, so later defaults apply too.
  const query = useGetUpdateEmailsQuery()
  const state = toLoadable(query)
  const document = state.status === 'loaded' ? state.data : null

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<UpdateEmailWording | null>(null)
  const [kind, setKind] = useState<UpdateEmailKind>('confirm')
  const [saveErrors, setSaveErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState('')
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [frameHeight, setFrameHeight] = useState(DEFAULT_FRAME_HEIGHT)
  const [saveWording, { isLoading: saving }] = useSaveUpdateEmailsMutation()
  const [reset, { isLoading: resetting }] = useResetUpdateEmailsMutation()
  const [test, { isLoading: testing }] = useTestUpdateEmailMutation()

  const wording = draft ?? document?.wording ?? null
  const changed = !!draft && !!document && !same(draft, document.wording)
  const isDefault = !!wording && !!document && same(wording, document.defaults)

  const { preview, catchingUp } = useSettledPreview(kind, wording)
  // The preview checks the draft as it's typed; a save's errors stand until the next change.
  const liveErrors = (preview.isError && fieldErrorsOf(preview.error)) || {}
  const errors = { ...liveErrors, ...saveErrors }

  function change(next: UpdateEmailWording) {
    setDraft(next)
    setSaveErrors({})
    setMessage('')
    setFailed('')
  }

  async function saveDraft() {
    if (!wording || !document) return
    setFailed('')
    setMessage('')
    try {
      // The defaults, unchanged: stored as "no wording of my own", so improved defaults reach the emails too.
      await (isDefault ? reset() : saveWording(wording)).unwrap()
      setDraft(null)
      setSaveErrors({})
      setEditing(false)
      setMessage('Saved. New emails use this wording.')
    } catch (error) {
      const fields = fieldErrorsOf(error)
      if (fields) {
        setSaveErrors(fields)
        setFailed('Some fields need a look.')
        // Show the first email with a problem.
        const first = Object.keys(fields)[0]?.split('.')[0]
        if (first === 'confirm' || first === 'video' || first === 'app') setKind(first)
      } else setFailed(saveFailedMessage(error))
    }
  }

  async function sendTest() {
    if (!wording) return
    setTestResult(null)
    try {
      setTestResult(await test({ kind, wording }).unwrap())
    } catch (error) {
      const fields = fieldErrorsOf(error)
      if (fields) {
        setSaveErrors(fields)
        // The fields to fix, even when it was the saved wording that was turned down.
        setEditing(true)
      }
      setTestResult({ ok: false, message: fields ? 'Fix the fields marked first.' : "The test couldn't be sent. Please try again." })
    }
  }
  const retry = () => void query.refetch()
  const choose = (next: UpdateEmailKind) => {
    setKind(next)
    setTestResult(null)
  }
  const edit = () => {
    setEditing(true)
    setMessage('')
  }
  const updatedAt = document?.updatedAt ?? null
  const busy = saving || resetting
  /** Back to the saved wording, and out of editing. */
  const cancel = () => {
    setDraft(null)
    setSaveErrors({})
    setMessage('')
    setFailed('')
    setEditing(false)
  }
  // The draft has changed since: the preview catches up after a pause.
  const previewStale = !!preview.data && (catchingUp || preview.isFetching || preview.isError)
  // The email's own height, so the whole of it shows under the glass, with nothing to scroll inside. The document's
  // own box: its scroll height is never less than the frame's.
  const fit = (frame: HTMLIFrameElement) => setFrameHeight(Math.ceil(frame.contentDocument?.documentElement.getBoundingClientRect().height ?? 0) || DEFAULT_FRAME_HEIGHT)
  const fieldsRef = useRef<HTMLDivElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(editing)

  // Into the first field on Edit (the first one marked, when a test was turned down); back to Edit after Save or
  // Cancel.
  useEffect(() => {
    if (editing === wasEditing.current) return
    wasEditing.current = editing
    const fields = fieldsRef.current
    if (editing) (fields?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? fields?.querySelector<HTMLElement>('input, textarea'))?.focus()
    else editRef.current?.focus()
  }, [editing])

  return (
    <section className="card community-card" aria-labelledby="email-wording-title">
      <div className="inbox-header">
        <h3 id="email-wording-title">Preview update emails</h3>
        {updatedAt && <span className="muted">Saved {formatDateTime(updatedAt)}</span>}
      </div>
      {state.status === 'loading' && (
        <Loading label="Loading the emails' wording…">
          <Skeleton width="60%" height={32} radius={999} />
          <Skeleton width="100%" height={240} />
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message="The emails' wording couldn't be loaded." onRetry={retry} />}
      {wording && (
        <>
          <div className="email-wording-kinds" role="group" aria-label="Which email">
            {UPDATE_EMAIL_KINDS.map((k) => (
              <button key={k} type="button" className="licence-toggle" aria-pressed={kind === k} onClick={() => choose(k)}>
                {KIND_NAMES[k]}
                {Object.keys(errors).some((key) => key.startsWith(`${k}.`)) && <span className="field-error"> · needs a look</span>}
              </button>
            ))}
          </div>

          <div className={editing ? 'email-wording-layout is-editing' : 'email-wording-layout'}>
            {editing && (
              <div className="email-wording-fields" ref={fieldsRef}>
                <EmailFields kind={kind} wording={wording} onChange={change} errors={errors} />
                <fieldset className="email-wording-footer">
                  <legend>Under every email</legend>
                  <TextField
                    label="Why they get it"
                    value={wording.footer.reason}
                    onChange={(reason) => change({ ...wording, footer: { ...wording.footer, reason } })}
                    error={errors['footer.reason']}
                    multiline
                    allowLinks
                  />
                  <TextField
                    label="About replies"
                    value={wording.footer.noReply}
                    onChange={(noReply) => change({ ...wording, footer: { ...wording.footer, noReply } })}
                    error={errors['footer.noReply']}
                    multiline
                    allowLinks
                  />
                </fieldset>
              </div>
            )}

            <div className="email-wording-preview" aria-busy={previewStale}>
              <h4>Preview</h4>
              {preview.data ? (
                <>
                  <dl className="email-wording-envelope">
                    <dt>From</dt>
                    <dd>{preview.data.from}</dd>
                    <dt>Subject</dt>
                    <dd>{preview.data.subject}</dd>
                  </dl>
                  {/* Under glass: inert, so nothing in it can be clicked or focused. Scripts stay off; same origin only to measure it. */}
                  <div className={previewStale ? 'email-wording-glass is-stale' : 'email-wording-glass'} inert>
                    <iframe
                      className="email-wording-frame"
                      title={`Preview of the ${KIND_NAMES[kind].toLowerCase()} email`}
                      sandbox="allow-same-origin"
                      srcDoc={preview.data.html}
                      style={{ height: frameHeight }}
                      onLoad={(e) => fit(e.currentTarget)}
                    />
                  </div>
                </>
              ) : preview.isError && !fieldErrorsOf(preview.error) ? (
                <p className="field-error">The preview couldn't be made.</p>
              ) : (
                <Loading label="Making the preview…">
                  <Skeleton width="100%" height={320} />
                </Loading>
              )}
            </div>
          </div>

          <div className="email-wording-actions">
            {editing ? (
              <>
                <button type="button" className="button" disabled={!changed || busy} onClick={() => void saveDraft()}>
                  {busy ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="button button-secondary" disabled={busy} onClick={cancel}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="button button-secondary" ref={editRef} onClick={edit}>
                <PencilIcon size={16} />
                Edit
              </button>
            )}
            <button type="button" className="button button-secondary" disabled={testing} onClick={() => void sendTest()}>
              {testing ? 'Sending…' : `Send me a test (${KIND_NAMES[kind].toLowerCase()})`}
            </button>
          </div>
          {changed && !message && <p className="muted">Unsaved changes: subscribers still get the saved wording.</p>}
          {message && (
            <p role="status" className="settings-ok">
              {message}
            </p>
          )}
          {failed && <p role="alert">{failed}</p>}
          {testResult && (
            <p role="status" className={testResult.ok ? 'settings-ok' : 'field-error'}>
              {testResult.ok ? '✓ ' : ''}
              {testResult.message}
            </p>
          )}
        </>
      )}
    </section>
  )
}

interface FieldsProps {
  kind: UpdateEmailKind
  wording: UpdateEmailWording
  onChange: (wording: UpdateEmailWording) => void
  errors: Record<string, string>
}

/** The same four fields for every email: subject, message, button, note. */
function EmailFields({ kind, wording, onChange, errors }: FieldsProps) {
  const words = wording[kind]
  const set = (field: 'subject' | 'intro' | 'button' | 'note') => (value: string) => onChange({ ...wording, [kind]: { ...words, [field]: value } })
  return (
    <>
      <TextField label="Subject" value={words.subject} onChange={set('subject')} error={errors[`${kind}.subject`]} required />
      <TextField label="Message" value={words.intro} onChange={set('intro')} error={errors[`${kind}.intro`]} multiline allowLinks required />
      <TextField label="Button" value={words.button} onChange={set('button')} error={errors[`${kind}.button`]} required />
      <TextField label="Note" value={words.note} onChange={set('note')} error={errors[`${kind}.note`]} multiline allowLinks />
    </>
  )
}
