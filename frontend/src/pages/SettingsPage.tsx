import { useEffect, useId, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../auth'
import { CopyButton } from '../components/CopyButton'
import { ExternalLinkIcon } from '../components/icons'
import { api, ApiError, type Setting, type SettingsResponse, type TestResult } from '../services/api'

type State = { status: 'loading' } | { status: 'error' } | { status: 'loaded'; data: SettingsResponse }

/**
 * Settings (an admin-only tab): every service the site connects to, with its links, its keys and a
 * test button. Keys saved here are stored encrypted, apply at once, and override the server's
 * configuration; secrets are never shown again, only their last 4 characters. Visitors go home.
 */
export function SettingsPage() {
  const { status } = useAuth()

  if (status === 'loading') return <p>Loading…</p>
  if (status === 'anonymous') return <Navigate to="/" replace />
  return <Settings />
}

function Settings() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    api.settings
      .get(controller.signal)
      .then((data) => setState({ status: 'loaded', data }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' })
      })
    return () => controller.abort()
  }, [])

  if (state.status === 'loading') return <p>Loading…</p>
  if (state.status === 'error') return <p role="alert">The settings couldn't be loaded.</p>

  const { data } = state
  const setting = (key: string) => data.settings.find((s) => s.key === key)!
  const onSaved = (next: SettingsResponse) => setState({ status: 'loaded', data: next })
  const field = (key: string, extra?: Partial<FieldProps>) => <SettingField setting={setting(key)} onSaved={onSaved} {...extra} />

  return (
    <div className="settings">
      <h2 className="visually-hidden">Settings</h2>
      <p className="muted">
        The services this site connects to. Keys saved here are stored encrypted, apply at once and replace the server's configuration; a secret is never shown again, only
        its last 4 characters.
      </p>

      <ServiceCard
        title="Buy Me a Coffee"
        what="The header's Buy me a coffee button, and a phone alert for each coffee."
        links={[
          ['Your page', setting('Support:Url').value || 'https://buymeacoffee.com'],
          ['Dashboard', 'https://studio.buymeacoffee.com'],
        ]}
      >
        {field('Support:Url', { placeholder: 'https://buymeacoffee.com/you' })}
        <Steps>
          <li>
            In the dashboard, open <strong>Integrations → Webhooks</strong> and add this link for donations:
            <Copyable value={`${data.siteUrl}/api/support/buymeacoffee`} />
          </li>
          <li>Copy the webhook's secret into the field below, save, then press its <strong>Send test</strong>: a coffee should land in the Community tab and on your phone.</li>
        </Steps>
        {field('Support:BuyMeACoffeeWebhookSecret')}
      </ServiceCard>

      <ServiceCard
        title="Google sign-in"
        what="How you sign in to this site. Set on the server only: a wrong secret saved here could lock you out."
        links={[['Google Cloud: OAuth clients', 'https://console.cloud.google.com/auth/clients']]}
      >
        <dl className="settings-facts">
          <dt>Status</dt>
          <dd>{data.google.isConfigured ? <span className="chip">Set up{data.google.clientIdHint ? ` · client ${data.google.clientIdHint}` : ''}</span> : <span className="chip chip-muted">Not set up</span>}</dd>
          <dt>Admins</dt>
          <dd>{data.google.adminEmailCount === 1 ? '1 email allowed' : `${data.google.adminEmailCount} emails allowed`}</dd>
          <dt>Redirect URI to register</dt>
          <dd>
            <Copyable value={data.google.redirectUri} />
          </dd>
        </dl>
      </ServiceCard>

      <ServiceCard
        title="YouTube Data API"
        what="The YouTube tab and What's new, and the emails about new videos."
        links={[
          ['Google Cloud: API keys', 'https://console.cloud.google.com/apis/credentials'],
          ['YouTube Studio', 'https://studio.youtube.com'],
        ]}
        test={{ service: 'youtube', label: 'List my videos' }}
      >
        {field('YouTube:Channel', { placeholder: '@yourhandle' })}
        {field('YouTube:ApiKey')}
      </ServiceCard>

      <ServiceCard
        title="Resend (email)"
        what="Confirmation emails for subscribers, and the emails about new apps and videos."
        links={[
          ['API keys', 'https://resend.com/api-keys'],
          ['Domains', 'https://resend.com/domains'],
        ]}
        test={{ service: 'email', label: 'Send me a test email' }}
      >
        {field('Email:ResendApiKey')}
        {field('Email:From', { placeholder: 'jechel.dev <updates@jechel.dev>', hint: "Its domain must be verified in Resend (Domains). Until then Resend only sends from onboarding@resend.dev, and only to your own address." })}
      </ServiceCard>

      <ServiceCard
        title="ntfy (phone alerts)"
        what="Alerts on your phone: new messages, coffees, subscribers, new apps (to send or ignore) and crashes."
        links={[
          ['ntfy', 'https://ntfy.sh'],
          ['Phone app guide', 'https://docs.ntfy.sh/subscribe/phone/'],
        ]}
        test={{ service: 'ntfy', label: 'Send a test alert' }}
      >
        <Steps>
          <li>
            Press <strong>Generate</strong> below for a private topic name, and <strong>Save</strong>.
          </li>
          <li>
            In the ntfy app, tap <strong>+</strong>, type the same topic (server: ntfy.sh), and <strong>Subscribe</strong>.
          </li>
          <li>
            Press <strong>Send a test alert</strong>. Anyone who knows the topic can read it, so keep it long and random.
          </li>
        </Steps>
        {field('Alerts:NtfyTopic', { generate: () => `jechel-${randomHex(12)}` })}
        <details className="settings-more">
          <summary>Your own ntfy server, or a reserved topic</summary>
          {field('Alerts:NtfyServer', { placeholder: 'https://ntfy.sh' })}
          {field('Alerts:NtfyToken')}
        </details>
      </ServiceCard>

      <ServiceCard title="Hosting" what="Where the site runs, its domain and its database. Not connected yet: it comes when the site goes live." links={[]}>
        <p className="muted">Nothing to set yet.</p>
      </ServiceCard>
    </div>
  )
}

function ServiceCard({
  title,
  what,
  links,
  test,
  children,
}: {
  title: string
  what: string
  links: [string, string][]
  test?: { service: 'ntfy' | 'email' | 'youtube'; label: string }
  children: ReactNode
}) {
  const id = useId()
  return (
    <section className="card settings-card" aria-labelledby={id}>
      <div className="settings-card-header">
        <h3 id={id}>{title}</h3>
        {links.length > 0 && (
          <div className="settings-links">
            {links.map(([label, href]) => (
              <a key={label} className="button button-secondary button-small" href={href} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon size={14} />
                {label}
              </a>
            ))}
          </div>
        )}
      </div>
      <p className="muted">{what}</p>
      {children}
      {test && <TestButton service={test.service} label={test.label} />}
    </section>
  )
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="settings-steps">{children}</ol>
}

function Copyable({ value }: { value: string }) {
  return (
    <span className="settings-copyable">
      <code>{value}</code>
      <CopyButton value={value} label="link" />
    </span>
  )
}

function TestButton({ service, label }: { service: 'ntfy' | 'email' | 'youtube'; label: string }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  async function run() {
    setBusy(true)
    setResult(null)
    try {
      setResult(await api.settings.test(service))
    } catch {
      setResult({ ok: false, message: "The test couldn't run. Please try again." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-test">
      <button type="button" className="button button-secondary" disabled={busy} onClick={() => void run()}>
        {busy ? 'Testing…' : label}
      </button>
      {result && (
        <p role="status" className={result.ok ? 'settings-ok' : 'field-error'}>
          {result.ok ? '✓ ' : ''}
          {result.message}
        </p>
      )}
    </div>
  )
}

interface FieldProps {
  setting: Setting
  onSaved: (next: SettingsResponse) => void
  placeholder?: string
  hint?: string
  /** Offers a Generate button that fills in a new value. */
  generate?: () => string
}

/** One setting: its value (or, for a secret, whether it's set), a box for a new one, Save, and Remove when it was saved here. */
function SettingField({ setting, onSaved, placeholder, hint, generate }: FieldProps) {
  const id = useId()
  const [draft, setDraft] = useState(setting.isSecret ? '' : (setting.value ?? ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  const current = setting.isSecret ? '' : (setting.value ?? '')
  const changed = draft.trim() !== current

  async function save(value: string) {
    setBusy(true)
    setError('')
    setSaved('')
    try {
      const next = await api.settings.save(setting.key, value)
      const updated = next.settings.find((s) => s.key === setting.key)
      setDraft(setting.isSecret ? '' : (updated?.value ?? ''))
      setSaved(value ? 'Saved.' : 'Removed.')
      onSaved(next)
    } catch (e) {
      setError(e instanceof ApiError && e.validationErrors?.value ? e.validationErrors.value[0] : "That couldn't be saved. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="field settings-field">
      <label htmlFor={id}>
        {setting.label}
        <span className="settings-source"> · {sourceText(setting)}</span>
      </label>
      <div className="settings-input-row">
        <input
          id={id}
          type={setting.isSecret ? 'password' : 'text'}
          autoComplete="off"
          spellCheck={false}
          value={draft}
          placeholder={setting.isSecret ? (setting.isSet ? 'Paste a new value to replace it' : 'Paste it here') : placeholder}
          onChange={(e) => setDraft(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        />
        {generate && (
          <button type="button" className="button button-secondary" onClick={() => setDraft(generate())}>
            Generate
          </button>
        )}
        {!setting.isSecret && draft && <CopyButton value={draft} label={setting.label.toLowerCase()} />}
        <button type="button" className="button" disabled={busy || !changed || (setting.isSecret && !draft.trim())} onClick={() => void save(draft.trim())}>
          Save
        </button>
        {setting.source === 'settings' && (
          <button type="button" className="button button-secondary" disabled={busy} onClick={() => void save('')}>
            Remove
          </button>
        )}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="settings-ok">
          {saved}
        </p>
      )}
    </div>
  )
}

function sourceText(setting: Setting): string {
  if (!setting.isSet) return 'not set'
  const where = setting.source === 'settings' ? 'saved here' : 'from the server configuration'
  return setting.isSecret && setting.hint ? `set, ends in ${setting.hint}, ${where}` : `set, ${where}`
}

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('')
}
