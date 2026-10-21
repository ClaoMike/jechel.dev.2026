import type { ReactNode } from 'react'
import { AdminOnly } from '../../components/AdminOnly/AdminOnly'
import { CopyButton } from '../../components/CopyButton/CopyButton'
import { ErrorState } from '../../components/ErrorState/ErrorState'
import { Loading, Skeleton } from '../../components/Skeleton'
import { ArrowDownIcon, ExternalLinkIcon } from '../../components/icons/icons'
import { SignedInDevices } from '../../features/auth/SignedInDevices/SignedInDevices'
import { SiteVisibility } from '../../features/site/SiteVisibility/SiteVisibility'
import type { Setting } from '../../services/api'
import type { TestableService } from '../../store/api/settingsApi'
import { newNtfyTopic, useServiceCardViewModel, useSettingFieldViewModel, useSettingsViewModel, useTestButtonViewModel, type ServiceStatus } from './SettingsPage.viewModel'

/**
 * Settings (an admin-only tab): what visitors see, the devices signed in as the admin, and every
 * service the site connects to, with its links, its keys and a test button. Keys saved here are stored encrypted, apply at once, and override the server's
 * configuration; secrets are never shown again, only their last 4 characters. Visitors go home.
 */
export function SettingsPage() {
  return (
    <AdminOnly>
      <div className="settings">
        <h2 className="visually-hidden">Settings</h2>
        <SiteVisibility />
        <SignedInDevices />
        <h3 className="settings-section-title">Connections</h3>
        <Settings />
      </div>
    </AdminOnly>
  )
}

function Settings() {
  const vm = useSettingsViewModel()
  const { state, setting, status } = vm

  if (state.status === 'loading')
    return (
      // The folded list of services, each a name and a status.
      <Loading label="Loading the settings…" className="settings">
        <Skeleton width="80%" height={14} />
        {[46, 38, 42, 34, 40, 26].map((width, i) => (
          <div key={i} className="card settings-card skeleton-settings-row">
            <Skeleton width={`${width}%`} height={18} />
            <Skeleton width={90} height={22} radius={999} />
          </div>
        ))}
      </Loading>
    )
  if (state.status === 'error') return <ErrorState message="The settings couldn't be loaded." onRetry={vm.retry} />

  const { data } = state
  const field = (key: string, extra?: Omit<FieldProps, 'setting'>) => <SettingField setting={setting(key)} {...extra} />

  return (
    <div className="settings">
      <p className="muted">
        The services this site connects to. Keys saved here are stored encrypted, apply at once and replace the server's configuration; a secret is never shown again, only its last
        4 characters.
      </p>

      <ServiceCard
        title="Buy Me a Coffee"
        status={status('Support:Url', 'Support:BuyMeACoffeeWebhookSecret')}
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
          <li>
            Copy the webhook's secret into the field below, save, then press its <strong>Send test</strong>: a coffee should land in the Community tab and on your phone.
          </li>
        </Steps>
        {field('Support:BuyMeACoffeeWebhookSecret')}
      </ServiceCard>

      <ServiceCard
        title="Google sign-in"
        status={data.google.isConfigured ? 'ready' : 'off'}
        what="How you sign in to this site. Set on the server only: a wrong secret saved here could lock you out."
        links={[['Google Cloud: OAuth clients', 'https://console.cloud.google.com/auth/clients']]}
      >
        <dl className="settings-facts">
          <dt>Status</dt>
          <dd>
            {data.google.isConfigured ? (
              <span className="chip">Set up{data.google.clientIdHint ? ` · client ${data.google.clientIdHint}` : ''}</span>
            ) : (
              <span className="chip chip-muted">Not set up</span>
            )}
          </dd>
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
        status={status('YouTube:Channel', 'YouTube:ApiKey')}
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
        title="Cal.com (meetings)"
        status={status('Cal:Link', 'Cal:ApiKey', 'Cal:WebhookSecret')}
        what="Book a meeting on the Contact page, the calendar above your messages, accepting or declining requests (here or from your phone), and the reminders."
        links={[
          ['Event types', 'https://app.cal.com/event-types'],
          ['Webhooks', 'https://app.cal.com/settings/developer/webhooks'],
          ['API keys', 'https://app.cal.com/settings/developer/api-keys'],
        ]}
        test={{ service: 'cal', label: 'Check the API key' }}
      >
        <Steps>
          <li>
            In <strong>Event types</strong>, make one (e.g. 30 minutes), set your availability, and under <strong>Advanced</strong> turn on <strong>Requires confirmation</strong>,
            so you accept each request. Paste its link below.
          </li>
          <li>
            In <strong>Webhooks</strong>, add this link, with a secret of your choice, for Booking requested, created, rescheduled, cancelled and rejected:
            <Copyable value={`${data.siteUrl}/api/meetings/cal`} />
          </li>
          <li>
            Paste the same secret below, then make an <strong>API key</strong> (Settings → Developer) and paste it too: it lets this site accept and decline for you.
          </li>
        </Steps>
        {field('Cal:Link', { placeholder: 'https://cal.com/you/30min' })}
        {field('Cal:WebhookSecret')}
        {field('Cal:ApiKey')}
      </ServiceCard>

      <ServiceCard
        title="Resend (email)"
        status={status('Email:ResendApiKey', 'Email:From')}
        links={[
          ['API keys', 'https://resend.com/api-keys'],
          ['Domains', 'https://resend.com/domains'],
        ]}
        test={{ service: 'email', label: 'Send me a test email' }}
      >
        {field('Email:ResendApiKey')}
        {field('Email:From', { placeholder: 'Claudiu from jechel.dev <hello@jechel.dev>' })}
        {field('Email:UpdatesFrom', { placeholder: 'jechel.dev <updates@jechel.dev>' })}
      </ServiceCard>

      <ServiceCard
        title="ntfy (phone alerts)"
        status={status('Alerts:NtfyTopic')}
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
        {field('Alerts:NtfyTopic', { generate: newNtfyTopic })}
        <details className="settings-more">
          <summary>Your own ntfy server, or a reserved topic</summary>
          {field('Alerts:NtfyServer', { placeholder: 'https://ntfy.sh' })}
          {field('Alerts:NtfyToken')}
        </details>
      </ServiceCard>

      <ServiceCard title="Hosting" status="later" what="Where the site runs, its domain and its database. Not connected yet: it comes when the site goes live." links={[]}>
        <p className="muted">Nothing to set yet.</p>
      </ServiceCard>
    </div>
  )
}

/** One service, folded to its name and status until clicked open. */
function ServiceCard({
  title,
  status,
  what,
  links,
  test,
  children,
}: {
  title: string
  status: ServiceStatus
  /** What the service is for. Optional. */
  what?: string
  links: [string, string][]
  test?: { service: TestableService; label: string }
  children: ReactNode
}) {
  const vm = useServiceCardViewModel(status)
  const { id } = vm
  return (
    <section className="card settings-card" aria-labelledby={id}>
      <h3 className="settings-card-heading">
        <button type="button" id={id} className="accordion-toggle" aria-expanded={vm.open} aria-controls={`${id}-body`} onClick={vm.toggle}>
          <ArrowDownIcon size={18} />
          <span className="accordion-title">{title}</span>
          <span className={`chip settings-status settings-status-${status}`}>{vm.statusText}</span>
        </button>
      </h3>
      <div id={`${id}-body`} className="settings-card-body" hidden={!vm.open}>
        {what && <p className="muted">{what}</p>}
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
        {children}
        {test && <TestButton service={test.service} label={test.label} />}
      </div>
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

function TestButton({ service, label }: { service: TestableService; label: string }) {
  const vm = useTestButtonViewModel(service)
  const { result } = vm

  return (
    <div className="settings-test">
      <button type="button" className="button button-secondary" disabled={vm.busy} onClick={vm.run}>
        {vm.busy ? 'Testing…' : label}
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
  placeholder?: string
  hint?: string
  /** Offers a Generate button that fills in a new value. */
  generate?: () => string
}

/** One setting: its value (or, for a secret, whether it's set), a box for a new one, Save, and Remove when it was saved here. */
function SettingField({ setting, placeholder, hint, generate }: FieldProps) {
  const vm = useSettingFieldViewModel(setting, placeholder)
  const { id, draft, error } = vm

  return (
    <div className="field settings-field">
      <label htmlFor={id}>
        {setting.label}
        <span className="settings-source"> · {vm.sourceText}</span>
      </label>
      <div className="settings-input-row">
        <input
          id={id}
          type={setting.isSecret ? 'password' : 'text'}
          autoComplete="off"
          spellCheck={false}
          value={draft}
          placeholder={vm.placeholder}
          onChange={(e) => vm.setDraft(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        />
        {generate && (
          <button type="button" className="button button-secondary" onClick={() => vm.setDraft(generate())}>
            Generate
          </button>
        )}
        {!setting.isSecret && draft && <CopyButton value={draft} label={setting.label.toLowerCase()} />}
        <button type="button" className="button" disabled={!vm.canSave} onClick={vm.save}>
          Save
        </button>
        {vm.canRemove && (
          <button type="button" className="button button-secondary" disabled={vm.busy} onClick={vm.remove}>
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
      {vm.saved && (
        <p role="status" className="settings-ok">
          {vm.saved}
        </p>
      )}
    </div>
  )
}
