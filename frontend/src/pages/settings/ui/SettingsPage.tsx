import { useId, useState, type ReactNode } from 'react'
import { AdminOnly } from '@/entities/session'
import { CopyButton } from '@/shared/ui/CopyButton'
import { ErrorState } from '@/shared/ui/ErrorState'
import { Loading, Skeleton } from '@/shared/ui/Skeleton'
import { ArrowDownIcon, ExternalLinkIcon } from '@/shared/ui/icons'
import { SignedInDevices } from './SignedInDevices/SignedInDevices'
import { SiteVisibility } from './SiteVisibility/SiteVisibility'
import { failureOf, type Setting, type TestResult } from '@/shared/api'
import { useGetSettingsQuery, useSaveSettingMutation, useTestServiceMutation, type TestableService } from '../api/settingsApi'
import { toLoadable } from '@/shared/api'
import { strings } from '@/shared/i18n'

type ServiceStatus = 'ready' | 'partial' | 'off'

const STATUS_TEXT: Record<ServiceStatus, string> = { ready: strings.settingsPage.setUp, partial: strings.settingsPage.partlySetUp, off: strings.settingsPage.notSetUp }

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** A private ntfy topic name: anyone who knows the topic can read it. */
const newNtfyTopic = () => `jechel-${randomHex(12)}`

function sourceText(setting: Setting): string {
  if (!setting.isSet) return strings.settingsPage.notSet
  const where = setting.source === 'settings' ? strings.settingsPage.savedHere : strings.settingsPage.serverConfiguration
  return setting.isSecret && setting.hint ? strings.settingsPage.setEnds(setting.hint, where) : strings.settingsPage.set(where)
}

/**
 * Settings (an admin-only tab): what visitors see, the devices signed in as the admin, and every
 * service the site connects to, with its links, its keys and a test button. Keys saved here are stored encrypted, apply at once, and override the server's
 * configuration; secrets are never shown again, only their last 4 characters. Visitors go home.
 */
export function SettingsPage() {
  return (
    <AdminOnly>
      <div className="settings">
        <h2 className="visually-hidden">{strings.settingsPage.settings}</h2>
        <SiteVisibility />
        <SignedInDevices />
        <Connections />
      </div>
    </AdminOnly>
  )
}

/** Every service the site connects to, A to Z, each an accordion inside one card (as the skills are in the editor). */
function Connections() {
  const query = useGetSettingsQuery()
  const state = toLoadable(query)
  const loaded = state.status === 'loaded' ? state.data : null
  const setting = (key: string) => loaded!.settings.find((s) => s.key === key)!
  /** "Set up" when every key the service needs is set, "Partly set up" when some are. */
  const status = (...keys: string[]): ServiceStatus => {
    const set = keys.filter((key) => setting(key).isSet).length
    return set === keys.length ? 'ready' : set > 0 ? 'partial' : 'off'
  }

  if (state.status === 'loading')
    return (
      <ConnectionsCard>
        {/* The folded list of services, each a name and a status. */}
        <Loading label={strings.settingsPage.loadingSettings} className="settings-connection-list">
          {[46, 38, 42, 34, 40, 26, 36, 30].map((width, i) => (
            <div key={i} className="editor-item settings-card skeleton-settings-row">
              <Skeleton width={`${width}%`} height={18} />
              <Skeleton width={90} height={22} radius={999} />
            </div>
          ))}
        </Loading>
      </ConnectionsCard>
    )
  if (state.status === 'error')
    return (
      <ConnectionsCard>
        <ErrorState message={strings.settingsPage.settingsCouldntLoaded} onRetry={() => void query.refetch()} />
      </ConnectionsCard>
    )

  const { data } = state
  const field = (key: string, extra?: Omit<FieldProps, 'setting'>) => <SettingField setting={setting(key)} {...extra} />

  return (
    <ConnectionsCard>
      <div className="settings-connection-list">
        <ServiceCard
          title={strings.settingsPage.buyMeCoffee}
          status={status('Support:Url', 'Support:BuyMeACoffeeWebhookSecret')}
          links={[
            [strings.settingsPage.page, setting('Support:Url').value || 'https://buymeacoffee.com'],
            [strings.settingsPage.dashboard, 'https://studio.buymeacoffee.com'],
          ]}
        >
          {field('Support:Url', { placeholder: 'https://buymeacoffee.com/you' })}
          <Steps>
            <li>
              {strings.settingsPage.dashboardOpen}
              <strong>{strings.settingsPage.integrationsWebhooks}</strong> {strings.settingsPage.addLinkDonations}
              <Copyable value={`${data.siteUrl}/api/support/buymeacoffee`} />
            </li>
            <li>
              {strings.settingsPage.copyWebhooksSecretInto}
              <strong>{strings.settingsPage.sendTest}</strong>
              {strings.settingsPage.coffeeMarkedTestShould}
            </li>
          </Steps>
          {field('Support:BuyMeACoffeeWebhookSecret')}
        </ServiceCard>

        <ServiceCard
          title={strings.settingsPage.calComMeetings}
          status={status('Cal:Link', 'Cal:ApiKey', 'Cal:WebhookSecret')}
          what={strings.settingsPage.invitationAddBookingLink}
          links={[
            [strings.settingsPage.eventTypes, 'https://app.cal.com/event-types'],
            [strings.settingsPage.webhooks, 'https://app.cal.com/settings/developer/webhooks'],
            [strings.settingsPage.apiKeys, 'https://app.cal.com/settings/developer/api-keys'],
          ]}
          test={{ service: 'cal', label: strings.settingsPage.checkApiKey }}
        >
          <Steps>
            <li>
              {strings.settingsPage.in}
              <strong>{strings.settingsPage.eventTypes}</strong>
              {strings.settingsPage.makeOneEG}
              <strong>{strings.settingsPage.hidden}</strong> {strings.settingsPage.onlyPeopleSendLink}
              <strong>{strings.settingsPage.advanced}</strong> {strings.settingsPage.turn}
              <strong>{strings.settingsPage.requiresConfirmation}</strong>
              {strings.settingsPage.soAcceptEachRequest}
            </li>
            <li>
              {strings.settingsPage.in}
              <strong>{strings.settingsPage.webhooks}</strong>
              {strings.settingsPage.addLinkSecretChoice}
              <Copyable value={`${data.siteUrl}/api/meetings/cal`} />
            </li>
            <li>
              {strings.settingsPage.pasteSameSecretBelow}
              <strong>{strings.settingsPage.apiKey}</strong> {strings.settingsPage.settingsDeveloperPasteToo}
            </li>
          </Steps>
          {field('Cal:Link', { placeholder: 'https://cal.com/you/30min' })}
          {field('Cal:WebhookSecret')}
          {field('Cal:ApiKey')}
        </ServiceCard>

        <ServiceCard
          title={strings.settingsPage.googleSign}
          status={data.google.isConfigured ? 'ready' : 'off'}
          links={[[strings.settingsPage.googleCloudOauthClients, 'https://console.cloud.google.com/auth/clients']]}
        >
          <dl className="settings-facts">
            <dt>{strings.common.status}</dt>
            <dd>
              {data.google.isConfigured ? (
                <span className="chip">
                  {strings.settingsPage.setUp}
                  {data.google.clientIdHint ? strings.settingsPage.client(data.google.clientIdHint) : ''}
                </span>
              ) : (
                <span className="chip chip-muted">{strings.settingsPage.notSetUp}</span>
              )}
            </dd>
            <dt>{strings.settingsPage.admins}</dt>
            <dd>{data.google.adminEmailCount === 1 ? strings.settingsPage.n1EmailAllowed : strings.settingsPage.emailsAllowed(data.google.adminEmailCount)}</dd>
            <dt>{strings.settingsPage.redirectUriRegister}</dt>
            <dd>
              <Copyable value={data.google.redirectUri} />
            </dd>
          </dl>
        </ServiceCard>

        <ServiceCard
          title={strings.settingsPage.hosting}
          links={[
            [strings.settingsPage.cloudflare, 'https://dash.cloudflare.com'],
            [strings.settingsPage.sliplane, 'https://sliplane.io'],
          ]}
        />

        <ServiceCard
          title={strings.settingsPage.ntfyPhoneAlerts}
          status={status('Alerts:NtfyTopic')}
          links={[
            ['ntfy', 'https://ntfy.sh'],
            [strings.settingsPage.phoneAppGuide, 'https://docs.ntfy.sh/subscribe/phone/'],
          ]}
          test={{ service: 'ntfy', label: strings.settingsPage.sendTestAlert }}
        >
          <Steps>
            <li>
              {strings.settingsPage.press}
              <strong>{strings.settingsPage.generate}</strong> {strings.settingsPage.belowPrivateTopicName}
              <strong>{strings.common.save}</strong>.
            </li>
            <li>
              {strings.settingsPage.ntfyAppTap}
              <strong>+</strong>
              {strings.settingsPage.typeSameTopicServer}
              <strong>{strings.settingsPage.subscribe}</strong>.
            </li>
            <li>
              {strings.settingsPage.press}
              <strong>{strings.settingsPage.sendTestAlert}</strong>
              {strings.settingsPage.anyoneWhoKnowsTopic}
            </li>
          </Steps>
          {field('Alerts:NtfyTopic', { generate: newNtfyTopic })}
          <details className="settings-more">
            <summary>{strings.settingsPage.ownNtfyServerReserved}</summary>
            {field('Alerts:NtfyServer', { placeholder: 'https://ntfy.sh' })}
            {field('Alerts:NtfyToken')}
          </details>
        </ServiceCard>

        <ServiceCard title={strings.settingsPage.porkbunDomain} links={[[strings.settingsPage.porkbun, 'https://porkbun.com/account/domainsSpeedy']]} />

        <ServiceCard
          title={strings.settingsPage.resendEmail}
          status={status('Email:ResendApiKey', 'Email:From')}
          links={[
            [strings.settingsPage.apiKeys, 'https://resend.com/api-keys'],
            [strings.settingsPage.domains, 'https://resend.com/domains'],
            [strings.settingsPage.webhooks, 'https://resend.com/webhooks'],
          ]}
          test={{ service: 'email', label: strings.settingsPage.sendMeTestEmail }}
        >
          {field('Email:ResendApiKey')}
          {field('Email:From', { placeholder: strings.settingsPage.claudiuJechelDevHello })}
          {field('Email:UpdatesFrom', { placeholder: strings.settingsPage.jechelDevUpdatesJechel })}
          <details className="settings-more">
            <summary>{strings.settingsPage.receivingEmail}</summary>
            <Steps>
              <li>
                {strings.settingsPage.in}
                <strong>{strings.settingsPage.domains}</strong>
                {strings.settingsPage.openDomainTurn}
                <strong>{strings.settingsPage.receiving}</strong>
                {strings.settingsPage.addMxRecordPorkbun}
              </li>
              <li>
                {strings.settingsPage.in}
                <strong>{strings.settingsPage.webhooks}</strong>
                {strings.settingsPage.addLink}
                <strong>{strings.settingsPage.emailReceived}</strong>:
                <Copyable value={`${data.siteUrl}/api/contact/inbound`} />
              </li>
              <li>{strings.settingsPage.pasteSigningSecretBelow}</li>
            </Steps>
            {field('Email:InboundWebhookSecret')}
          </details>
        </ServiceCard>

        <ServiceCard
          title={strings.settingsPage.youtubeDataApi}
          status={status('YouTube:Channel', 'YouTube:ApiKey')}
          links={[
            [strings.settingsPage.googleCloudApiKeys, 'https://console.cloud.google.com/apis/credentials'],
            [strings.settingsPage.youtubeStudio, 'https://studio.youtube.com'],
          ]}
          test={{ service: 'youtube', label: strings.settingsPage.listMyVideos }}
        >
          {field('YouTube:Channel', { placeholder: '@yourhandle' })}
          {field('YouTube:ApiKey')}
        </ServiceCard>
      </div>
    </ConnectionsCard>
  )
}

/** The Connections card: its title inside, like Visitor pages. */
function ConnectionsCard({ children }: { children: ReactNode }) {
  return (
    <section className="card settings-connections" aria-labelledby="connections-title">
      <h3 id="connections-title">{strings.settingsPage.connections}</h3>
      {children}
    </section>
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
  /** None for a card that's only links to the service. */
  status?: ServiceStatus
  /** What the service is for. Optional. */
  what?: string
  links: [string, string][]
  test?: { service: TestableService; label: string }
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <section className="editor-item settings-card" aria-labelledby={id}>
      <h4 className="settings-card-heading">
        <button type="button" id={id} className="accordion-toggle" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen(!open)}>
          <ArrowDownIcon size={18} />
          <span className="accordion-title">{title}</span>
          {status && <span className={`chip settings-status settings-status-${status}`}>{STATUS_TEXT[status]}</span>}
        </button>
      </h4>
      <div id={`${id}-body`} className="settings-card-body" hidden={!open}>
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
      <CopyButton value={value} label={strings.settingsPage.link} />
    </span>
  )
}

function TestButton({ service, label }: { service: TestableService; label: string }) {
  const [test, { isLoading: busy }] = useTestServiceMutation()
  const [result, setResult] = useState<TestResult | null>(null)

  async function run() {
    setResult(null)
    try {
      setResult(await test(service).unwrap())
    } catch {
      setResult({ ok: false, message: strings.settingsPage.testCouldntRunPlease })
    }
  }

  return (
    <div className="settings-test">
      <button type="button" className="button button-secondary" disabled={busy} onClick={() => void run()}>
        {busy ? strings.settingsPage.testing : label}
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
  const id = useId()
  const [draft, setDraft] = useState(setting.isSecret ? '' : (setting.value ?? ''))
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [saveSetting, { isLoading: busy }] = useSaveSettingMutation()
  const changed = draft.trim() !== (setting.isSecret ? '' : (setting.value ?? ''))

  // Saves a new value (or removes the one saved here, with ""). The store then shows every setting as the API has it.
  async function save(value: string) {
    setError('')
    setSaved('')
    try {
      const next = await saveSetting({ key: setting.key, value }).unwrap()
      const updated = next.settings.find((s) => s.key === setting.key)
      setDraft(setting.isSecret ? '' : (updated?.value ?? ''))
      setSaved(value ? strings.common.saved : strings.settingsPage.removed)
    } catch (e) {
      setError(failureOf(e).validationErrors?.value?.[0] ?? strings.common.couldntSavedPleaseTry)
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
          placeholder={setting.isSecret ? (setting.isSet ? strings.settingsPage.pasteNewValueReplace : strings.settingsPage.pasteHere) : placeholder}
          onChange={(e) => setDraft(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        />
        {generate && (
          <button type="button" className="button button-secondary" onClick={() => setDraft(generate())}>
            {strings.settingsPage.generate}
          </button>
        )}
        {!setting.isSecret && draft && <CopyButton value={draft} label={setting.label.toLowerCase()} />}
        <button type="button" className="button" disabled={busy || !changed || (setting.isSecret && !draft.trim())} onClick={() => void save(draft.trim())}>
          {strings.common.save}
        </button>
        {setting.source === 'settings' && (
          <button type="button" className="button button-secondary" disabled={busy} onClick={() => void save('')}>
            {strings.common.remove}
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
