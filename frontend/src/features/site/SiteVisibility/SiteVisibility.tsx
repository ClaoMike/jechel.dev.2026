import { useId, useState } from 'react'
import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { Loading, Skeleton, SkeletonList } from '../../../components/Skeleton'
import { SITE_FEATURES, SITE_PAGES, type SaveSiteRequest, type SiteFeature, type SitePage } from '../../../services/api'
import { useAppDispatch, useAppSelector } from '../../../store'
import { useGetSupportQuery } from '../../../store/api/communityApi'
import { fetchSite, saveSite } from '../../../store/siteSlice'
import { strings } from '../../../strings'

const PAGE_LABELS: Record<SitePage, string> = {
  whatsNew: strings.common.whatsNew,
  apps: strings.common.apps,
  youtube: 'YouTube',
  about: strings.common.aboutMe,
  contact: strings.siteVisibility.contact,
}

const FEATURE_LABELS: Record<SiteFeature, string> = { coffee: strings.siteVisibility.buyMeCoffee, updates: strings.common.getUpdates, workWithMe: strings.siteVisibility.workMe }

/** One switch as the view shows it. */
interface SwitchItem {
  key: string
  label: string
  on: boolean
  busy: boolean
  toggle: () => void
  /** Why it doesn't show yet although it's on, and what to do. */
  note?: string
}

/** Buy me a coffee, on, needs its page link too: until then visitors get no button. */
const NO_COFFEE_LINK = strings.siteVisibility.visitorsDontSeeButton

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
  // Null: the saved message, as long as nothing's been typed.
  const [message, setMessage] = useState<string | null>(null)
  // The same answer the header's button uses (asked again when the switch or the link changes): "" means no button.
  const support = useGetSupportQuery()

  async function save(key: string, changes: SaveSiteRequest) {
    setSaving(key)
    setError('')
    try {
      await dispatch(saveSite(changes)).unwrap()
      return true
    } catch {
      setError(strings.common.couldntSavedPleaseTry)
      return false
    } finally {
      setSaving(null)
    }
  }

  if (state.status === 'loading')
    return (
      <section className="card site-visibility">
        <Loading label={strings.siteVisibility.loadingVisitorPages}>
          <Skeleton width="30%" height={20} />
          <SkeletonList rows={5} />
        </Loading>
      </section>
    )
  if (state.status === 'unreachable') return <ErrorState message={strings.siteVisibility.visitorPagesCouldntLoaded} onRetry={() => void dispatch(fetchSite())} />

  const { site } = state
  const draftMessage = message ?? site.maintenanceMessage
  const item = (key: string, label: string, on: boolean, changes: (on: boolean) => SaveSiteRequest): SwitchItem => ({
    key,
    label,
    on,
    busy: saving === key,
    toggle: () => void save(key, changes(!on)),
  })
  const features = SITE_FEATURES.map((feature) => {
    const switched = item(feature, FEATURE_LABELS[feature], site.features[feature], (on) => ({ features: { [feature]: on } }))
    const noLink = feature === 'coffee' && switched.on && !support.isFetching && support.data?.url === ''
    return noLink ? { ...switched, note: NO_COFFEE_LINK } : switched
  })

  return (
    <section className="card site-visibility" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{strings.siteVisibility.visitorPages}</h3>
      {SITE_PAGES.every((page) => !site.pages[page]) && <p className="muted">{strings.siteVisibility.everyPageOffVisitors}</p>}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}

      <fieldset className="switch-list">
        <legend className="field-label">{strings.siteVisibility.pages}</legend>
        {SITE_PAGES.map((page) => (
          <Switch key={page} item={item(page, PAGE_LABELS[page], site.pages[page], (on) => ({ pages: { [page]: on } }))} />
        ))}
      </fieldset>

      <fieldset className="switch-list">
        <legend className="field-label">{strings.siteVisibility.features}</legend>
        {features.map((item) => (
          <Switch key={item.key} item={item} />
        ))}
      </fieldset>

      <fieldset className="switch-list">
        <legend className="field-label">{strings.siteVisibility.maintenance}</legend>
        <Switch item={item('maintenance', strings.siteVisibility.underMaintenance, site.maintenance, (on) => ({ maintenance: on }))} />
        <div className="field">
          <label htmlFor={`${id}-message`}>{strings.siteVisibility.messageMaintenancePageOptional}</label>
          <div className="settings-input-row">
            <input
              id={`${id}-message`}
              type="text"
              maxLength={300}
              value={draftMessage}
              placeholder={strings.siteVisibility.back1800}
              onChange={(e) => setMessage(e.target.value)}
            />
            <button
              type="button"
              className="button"
              disabled={saving === 'message' || draftMessage.trim() === site.maintenanceMessage}
              onClick={() => void save('message', { maintenanceMessage: draftMessage.trim() }).then((saved) => saved && setMessage(null))}
            >
              {strings.common.save}
            </button>
          </div>
        </div>
      </fieldset>
    </section>
  )
}

/** An on / off switch (a button with role="switch"). */
function Switch({ item }: { item: SwitchItem }) {
  const id = useId()
  return (
    <div className="switch-row">
      <span className="switch-text">
        <span id={`${id}-label`}>{item.label}</span>
        {item.note && (
          <span id={`${id}-note`} className="field-hint switch-note">
            {item.note}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        className="switch"
        aria-checked={item.on}
        aria-labelledby={`${id}-label`}
        aria-describedby={item.note ? `${id}-note` : undefined}
        disabled={item.busy}
        onClick={item.toggle}
      >
        <span className="switch-thumb" aria-hidden="true" />
        <span className="switch-state" aria-hidden="true">
          {item.on ? strings.siteVisibility.on : strings.siteVisibility.off}
        </span>
      </button>
    </div>
  )
}
