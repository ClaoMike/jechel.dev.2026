import { useId, useState } from 'react'
import { SITE_FEATURES, SITE_PAGES, type SaveSiteRequest, type SiteFeature, type SitePage } from '../../../services/api'
import { useAppDispatch, useAppSelector } from '../../../store'
import { fetchSite, saveSite } from '../../../store/siteSlice'

const PAGE_LABELS: Record<SitePage, string> = { whatsNew: "What's new?", apps: 'Apps', youtube: 'YouTube', about: 'About Me', contact: 'Contact' }

const FEATURE_LABELS: Record<SiteFeature, string> = { meetings: 'Book a meeting', coffee: 'Buy me a coffee', updates: 'Get updates' }

/** One switch as the view shows it. */
export interface SwitchItem {
  key: string
  label: string
  on: boolean
  busy: boolean
  toggle: () => void
}

export function useSiteVisibilityViewModel() {
  const id = useId()
  const dispatch = useAppDispatch()
  const state = useAppSelector((s) => s.site)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  // Null: the saved message, as long as nothing's been typed.
  const [message, setMessage] = useState<string | null>(null)

  async function save(key: string, changes: SaveSiteRequest) {
    setSaving(key)
    setError('')
    try {
      await dispatch(saveSite(changes)).unwrap()
      return true
    } catch {
      setError("That couldn't be saved. Please try again.")
      return false
    } finally {
      setSaving(null)
    }
  }

  const base = { id, error, retry: () => void dispatch(fetchSite()) }
  if (state.status === 'loading') return { ...base, status: 'loading' as const }
  if (state.status === 'unreachable') return { ...base, status: 'error' as const }

  const { site } = state
  const draftMessage = message ?? site.maintenanceMessage
  const item = (key: string, label: string, on: boolean, changes: (on: boolean) => SaveSiteRequest): SwitchItem => ({
    key,
    label,
    on,
    busy: saving === key,
    toggle: () => void save(key, changes(!on)),
  })

  return {
    ...base,
    status: 'loaded' as const,
    allPagesOff: SITE_PAGES.every((page) => !site.pages[page]),
    pages: SITE_PAGES.map((page) => item(page, PAGE_LABELS[page], site.pages[page], (on) => ({ pages: { [page]: on } }))),
    features: SITE_FEATURES.map((feature) => item(feature, FEATURE_LABELS[feature], site.features[feature], (on) => ({ features: { [feature]: on } }))),
    maintenance: item('maintenance', 'Under maintenance', site.maintenance, (on) => ({ maintenance: on })),
    draftMessage,
    setMessage,
    canSaveMessage: saving !== 'message' && draftMessage.trim() !== site.maintenanceMessage,
    saveMessage: () => void save('message', { maintenanceMessage: draftMessage.trim() }).then((saved) => saved && setMessage(null)),
  }
}

/** An on / off switch's own ids. */
export function useSwitchViewModel() {
  return { id: useId() }
}
