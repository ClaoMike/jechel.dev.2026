import { useId, useState } from 'react'
import { ErrorState } from '../../components/ErrorState'
import { Loading, Skeleton, SkeletonList } from '../../components/Skeleton'
import { SITE_FEATURES, SITE_PAGES, type SaveSiteRequest, type SiteFeature, type SitePage } from '../../services/api'
import { useAppDispatch, useAppSelector } from '../../store'
import { fetchSite, saveSite } from '../../store/siteSlice'

const PAGE_LABELS: Record<SitePage, string> = { whatsNew: "What's new?", apps: 'Apps', youtube: 'YouTube', about: 'About Me', contact: 'Contact' }

const FEATURE_LABELS: Record<SiteFeature, { label: string; hint: string }> = {
  meetings: { label: 'Book a meeting', hint: 'On the Contact page; needs Cal.com (below).' },
  coffee: { label: 'Buy me a coffee', hint: 'In the header; needs Buy Me a Coffee (below).' },
  updates: { label: 'Get updates', hint: 'In the header; needs Resend (below) to send the emails.' },
}

/**
 * Settings → Visitor pages: what visitors can see, switched on one by one as each part is ready
 * (everything starts off), and maintenance mode. Each switch saves at once.
 */
export function SiteVisibility() {
  const id = useId()
  const dispatch = useAppDispatch()
  const state = useAppSelector((s) => s.site)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  if (state.status === 'loading')
    return (
      <section className="card site-visibility">
        <Loading label="Loading the visitor pages…">
          <Skeleton width="30%" height={20} />
          <SkeletonList rows={5} />
        </Loading>
      </section>
    )
  if (state.status === 'unreachable') return <ErrorState message="The visitor pages couldn't be loaded." onRetry={() => void dispatch(fetchSite())} />

  const { site } = state
  const draftMessage = message ?? site.maintenanceMessage

  async function save(key: string, changes: SaveSiteRequest) {
    setSaving(key)
    setError('')
    try {
      await dispatch(saveSite(changes)).unwrap()
    } catch {
      setError("That couldn't be saved. Please try again.")
    } finally {
      setSaving(null)
    }
  }

  const shown = SITE_PAGES.filter((p) => site.pages[p]).length

  return (
    <section className="card site-visibility" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>Visitor pages</h3>
      <p className="muted">
        What visitors can see. Everything starts off: switch each part on once it's ready. You always see every page (hidden ones are marked in the tabs).
        {shown === 0 && ' With every page off, visitors get "Coming soon".'}
      </p>
      {error && <p role="alert" className="field-error">{error}</p>}

      <fieldset className="switch-list">
        <legend className="field-label">Pages</legend>
        {SITE_PAGES.map((page) => (
          <Switch key={page} label={PAGE_LABELS[page]} on={site.pages[page]} busy={saving === page} onChange={(on) => void save(page, { pages: { [page]: on } })} />
        ))}
      </fieldset>

      <fieldset className="switch-list">
        <legend className="field-label">Features</legend>
        {SITE_FEATURES.map((feature) => (
          <Switch
            key={feature}
            label={FEATURE_LABELS[feature].label}
            hint={FEATURE_LABELS[feature].hint}
            on={site.features[feature]}
            busy={saving === feature}
            onChange={(on) => void save(feature, { features: { [feature]: on } })}
          />
        ))}
      </fieldset>

      <fieldset className="switch-list">
        <legend className="field-label">Maintenance</legend>
        <Switch
          label="Under maintenance"
          hint="Visitors see a maintenance page instead of the site; you still see everything."
          on={site.maintenance}
          busy={saving === 'maintenance'}
          onChange={(on) => void save('maintenance', { maintenance: on })}
        />
        <div className="field">
          <label htmlFor={`${id}-message`}>Message on the maintenance page (optional)</label>
          <div className="settings-input-row">
            <input id={`${id}-message`} type="text" maxLength={300} value={draftMessage} placeholder="Back by 18:00" onChange={(e) => setMessage(e.target.value)} />
            <button
              type="button"
              className="button"
              disabled={saving === 'message' || draftMessage.trim() === site.maintenanceMessage}
              onClick={() => void save('message', { maintenanceMessage: draftMessage.trim() }).then(() => setMessage(null))}
            >
              Save
            </button>
          </div>
        </div>
      </fieldset>
    </section>
  )
}

/** An on / off switch (a button with role="switch"). */
function Switch({ label, hint, on, busy, onChange }: { label: string; hint?: string; on: boolean; busy: boolean; onChange: (on: boolean) => void }) {
  const id = useId()
  return (
    <div className="switch-row">
      <span className="switch-text">
        <span id={`${id}-label`}>{label}</span>
        {hint && (
          <span id={`${id}-hint`} className="muted switch-hint">
            {hint}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        className="switch"
        aria-checked={on}
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        disabled={busy}
        onClick={() => onChange(!on)}
      >
        <span className="switch-thumb" aria-hidden="true" />
        <span className="switch-state" aria-hidden="true">
          {on ? 'On' : 'Off'}
        </span>
      </button>
    </div>
  )
}
