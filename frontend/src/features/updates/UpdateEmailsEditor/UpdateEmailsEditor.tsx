import { useEffect, useRef } from 'react'
import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { TextField } from '../../../components/fields'
import { PencilIcon } from '../../../components/icons/icons'
import { Loading, Skeleton } from '../../../components/Skeleton'
import { UPDATE_EMAIL_KINDS, type UpdateEmailKind, type UpdateEmailWording } from '../../../services/api'
import { formatDateTime } from '../../../utils/formatDate'
import { KIND_NAMES, useUpdateEmailsEditorViewModel } from './UpdateEmailsEditor.viewModel'

/**
 * The emails subscribers get, in the admin's words (Community tab): one email at a time, its preview under
 * glass (to look at, not to click). Edit brings up the same four fields for each beside the preview, which
 * follows them; Save keeps the changes, Cancel throws them away. A test of the draft goes to the admin's own inbox.
 */
export function UpdateEmailsEditor() {
  const vm = useUpdateEmailsEditorViewModel()
  const { state, wording, kind, errors, preview, editing } = vm
  const fieldsRef = useRef<HTMLDivElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(editing)

  // Into the first field on Edit; back to Edit after Save or Cancel.
  useEffect(() => {
    if (editing === wasEditing.current) return
    wasEditing.current = editing
    if (editing) fieldsRef.current?.querySelector<HTMLElement>('input, textarea')?.focus()
    else editRef.current?.focus()
  }, [editing])

  return (
    <section className="card community-card" aria-labelledby="email-wording-title">
      <div className="inbox-header">
        <h3 id="email-wording-title">Preview update emails</h3>
        {vm.updatedAt && <span className="muted">Saved {formatDateTime(vm.updatedAt)}</span>}
      </div>
      {state.status === 'loading' && (
        <Loading label="Loading the emails' wording…">
          <Skeleton width="60%" height={32} radius={999} />
          <Skeleton width="100%" height={240} />
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message="The emails' wording couldn't be loaded." onRetry={vm.retry} />}
      {wording && (
        <>
          <div className="email-wording-kinds" role="group" aria-label="Which email">
            {UPDATE_EMAIL_KINDS.map((k) => (
              <button key={k} type="button" className="licence-toggle" aria-pressed={kind === k} onClick={() => vm.choose(k)}>
                {KIND_NAMES[k]}
                {Object.keys(errors).some((key) => key.startsWith(`${k}.`)) && <span className="field-error"> · needs a look</span>}
              </button>
            ))}
          </div>

          <div className={editing ? 'email-wording-layout is-editing' : 'email-wording-layout'}>
            {editing && (
              <div className="email-wording-fields" ref={fieldsRef}>
                <EmailFields kind={kind} wording={wording} onChange={vm.change} errors={errors} />
                <fieldset className="email-wording-footer">
                  <legend>Under every email</legend>
                  <TextField
                    label="Why they get it"
                    value={wording.footer.reason}
                    onChange={(reason) => vm.change({ ...wording, footer: { ...wording.footer, reason } })}
                    error={errors['footer.reason']}
                    multiline
                    allowLinks
                  />
                  <TextField
                    label="About replies"
                    value={wording.footer.noReply}
                    onChange={(noReply) => vm.change({ ...wording, footer: { ...wording.footer, noReply } })}
                    error={errors['footer.noReply']}
                    multiline
                    allowLinks
                  />
                </fieldset>
              </div>
            )}

            <div className="email-wording-preview" aria-busy={preview.stale}>
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
                  <div className={preview.stale ? 'email-wording-glass is-stale' : 'email-wording-glass'} inert>
                    <iframe
                      className="email-wording-frame"
                      title={`Preview of the ${KIND_NAMES[kind].toLowerCase()} email`}
                      sandbox="allow-same-origin"
                      srcDoc={preview.data.html}
                      style={{ height: preview.height }}
                      onLoad={(e) => preview.fit(e.currentTarget)}
                    />
                  </div>
                </>
              ) : preview.failed ? (
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
                <button type="button" className="button" disabled={!vm.changed || vm.busy} onClick={vm.save}>
                  {vm.busy ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="button button-secondary" disabled={vm.busy} onClick={vm.cancel}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="button button-secondary" ref={editRef} onClick={vm.edit}>
                <PencilIcon size={16} />
                Edit
              </button>
            )}
            <button type="button" className="button button-secondary" disabled={vm.testing} onClick={vm.sendTest}>
              {vm.testing ? 'Sending…' : `Send me a test (${KIND_NAMES[kind].toLowerCase()})`}
            </button>
          </div>
          {vm.changed && !vm.message && <p className="muted">Unsaved changes: subscribers still get the saved wording.</p>}
          {vm.message && (
            <p role="status" className="settings-ok">
              {vm.message}
            </p>
          )}
          {vm.failed && <p role="alert">{vm.failed}</p>}
          {vm.testResult && (
            <p role="status" className={vm.testResult.ok ? 'settings-ok' : 'field-error'}>
              {vm.testResult.ok ? '✓ ' : ''}
              {vm.testResult.message}
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
