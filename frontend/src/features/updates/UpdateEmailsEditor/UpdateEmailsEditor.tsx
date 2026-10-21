import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { TextField } from '../../../components/fields'
import { Loading, Skeleton } from '../../../components/Skeleton'
import { UPDATE_EMAIL_KINDS, type ItemWording, type UpdateEmailWording } from '../../../services/api'
import { formatDateTime } from '../../../utils/formatDate'
import { KIND_NAMES, useUpdateEmailsEditorViewModel } from './UpdateEmailsEditor.viewModel'

const TITLE_HINT = '{title} becomes the name of the new one.'

/**
 * The emails subscribers get, in the admin's words (Community tab): one email at a time, its fields
 * beside a live preview, then Save, and a test of the draft sent to the admin's own inbox.
 */
export function UpdateEmailsEditor() {
  const vm = useUpdateEmailsEditorViewModel()
  const { state, wording, kind, errors, preview } = vm

  return (
    <section className="card community-card" aria-labelledby="email-wording-title">
      <div className="inbox-header">
        <h3 id="email-wording-title">Emails to subscribers</h3>
        {state.status === 'loaded' && <span className="muted">{vm.updatedAt ? `Your wording, saved ${formatDateTime(vm.updatedAt)}` : 'The default wording'}</span>}
      </div>
      <p className="muted">
        What subscribers get, in your words. They go out from the updates sender (Settings → Resend), an address that takes no replies. Longer texts can have paragraphs (a blank
        line) and links.
      </p>
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

          <div className="email-wording-layout">
            <div className="email-wording-fields">
              {kind === 'confirm' ? (
                <ConfirmFields wording={wording} onChange={vm.change} errors={errors} />
              ) : (
                <ItemFields kind={kind} wording={wording} onChange={vm.change} errors={errors} />
              )}
              <fieldset className="email-wording-footer">
                <legend>Under every email</legend>
                <TextField
                  label="Why they get it"
                  hint="Update emails only, before the Unsubscribe link (always there). Optional."
                  value={wording.footer.reason}
                  onChange={(reason) => vm.change({ ...wording, footer: { ...wording.footer, reason } })}
                  error={errors['footer.reason']}
                  multiline
                  allowLinks
                />
                <TextField
                  label="About replies"
                  hint="Every email: that replies aren't read, and where to write instead. Optional."
                  value={wording.footer.noReply}
                  onChange={(noReply) => vm.change({ ...wording, footer: { ...wording.footer, noReply } })}
                  error={errors['footer.noReply']}
                  multiline
                  allowLinks
                />
              </fieldset>
            </div>

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
                  <iframe
                    className={preview.stale ? 'email-wording-frame is-stale' : 'email-wording-frame'}
                    title={`Preview of the ${KIND_NAMES[kind].toLowerCase()} email`}
                    sandbox=""
                    srcDoc={preview.data.html}
                  />
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
            <button type="button" className="button" disabled={!vm.changed || vm.busy} onClick={vm.save}>
              {vm.busy ? 'Saving…' : 'Save'}
            </button>
            {vm.changed && (
              <button type="button" className="button button-secondary" disabled={vm.busy} onClick={vm.discard}>
                Discard changes
              </button>
            )}
            {!vm.isDefault && (
              <button type="button" className="button button-secondary" disabled={vm.busy} onClick={vm.useDefaults}>
                Use the default wording
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
  wording: UpdateEmailWording
  onChange: (wording: UpdateEmailWording) => void
  errors: Record<string, string>
}

function ConfirmFields({ wording, onChange, errors }: FieldsProps) {
  const set = (field: keyof UpdateEmailWording['confirm']) => (value: string) => onChange({ ...wording, confirm: { ...wording.confirm, [field]: value } })
  const { confirm } = wording
  return (
    <>
      <TextField label="Subject" value={confirm.subject} onChange={set('subject')} error={errors['confirm.subject']} required />
      <TextField label="Message" hint="Before the button." value={confirm.intro} onChange={set('intro')} error={errors['confirm.intro']} multiline allowLinks required />
      <TextField label="Button" hint="It confirms the subscription." value={confirm.button} onChange={set('button')} error={errors['confirm.button']} required />
      <TextField label="Note" hint="Under the button, in grey. Optional." value={confirm.note} onChange={set('note')} error={errors['confirm.note']} multiline allowLinks />
    </>
  )
}

function ItemFields({ kind, wording, onChange, errors }: FieldsProps & { kind: 'video' | 'app' }) {
  const item = wording[kind]
  const set = (field: keyof ItemWording) => (value: string) => onChange({ ...wording, [kind]: { ...item, [field]: value } })
  return (
    <>
      <TextField label="Subject" hint={TITLE_HINT} value={item.subject} onChange={set('subject')} error={errors[`${kind}.subject`]} required />
      <TextField
        label="Heading"
        hint={`Above the ${kind}'s name, in grey. ${TITLE_HINT}`}
        value={item.heading}
        onChange={set('heading')}
        error={errors[`${kind}.heading`]}
        required
      />
      <TextField
        label="Button"
        hint={kind === 'video' ? 'It opens the video on YouTube.' : 'It opens the Apps page.'}
        value={item.button}
        onChange={set('button')}
        error={errors[`${kind}.button`]}
        required
      />
    </>
  )
}
