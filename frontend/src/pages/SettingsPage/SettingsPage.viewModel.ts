import { useId, useState } from 'react'
import { failureOf, type Setting, type TestResult } from '../../services/api'
import { useGetSettingsQuery, useSaveSettingMutation, useTestServiceMutation, type TestableService } from '../../store/api/settingsApi'
import { toLoadable } from '../../store/loadable'

export type ServiceStatus = 'ready' | 'partial' | 'off'

const STATUS_TEXT: Record<ServiceStatus, string> = { ready: 'Set up', partial: 'Partly set up', off: 'Not set up' }

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** A private ntfy topic name: anyone who knows the topic can read it. */
export const newNtfyTopic = () => `jechel-${randomHex(12)}`

/** Every connection setting from the store, and how set up each service is. */
export function useSettingsViewModel() {
  const query = useGetSettingsQuery()
  const state = toLoadable(query)
  const data = state.status === 'loaded' ? state.data : null
  const setting = (key: string) => data!.settings.find((s) => s.key === key)!

  return {
    state,
    retry: () => void query.refetch(),
    setting,
    /** "Set up" when every key the service needs is set, "Partly set up" when some are. */
    status: (...keys: string[]): ServiceStatus => {
      const set = keys.filter((key) => setting(key).isSet).length
      return set === keys.length ? 'ready' : set > 0 ? 'partial' : 'off'
    },
  }
}

/** One service, folded to its name and status (none for one that's only links) until clicked open. */
export function useServiceCardViewModel(status?: ServiceStatus) {
  const [open, setOpen] = useState(false)
  return { id: useId(), open, toggle: () => setOpen(!open), statusText: status && STATUS_TEXT[status] }
}

export function useTestButtonViewModel(service: TestableService) {
  const [test, { isLoading: busy }] = useTestServiceMutation()
  const [result, setResult] = useState<TestResult | null>(null)

  async function run() {
    setResult(null)
    try {
      setResult(await test(service).unwrap())
    } catch {
      setResult({ ok: false, message: "The test couldn't run. Please try again." })
    }
  }

  return { busy, result, run: () => void run() }
}

function sourceText(setting: Setting): string {
  if (!setting.isSet) return 'not set'
  const where = setting.source === 'settings' ? 'saved here' : 'from the server configuration'
  return setting.isSecret && setting.hint ? `set, ends in ${setting.hint}, ${where}` : `set, ${where}`
}

/** A box for a new value, saving it (or removing the one saved here). The store then shows every setting as the API has it. */
export function useSettingFieldViewModel(setting: Setting, placeholder?: string) {
  const [draft, setDraft] = useState(setting.isSecret ? '' : (setting.value ?? ''))
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [saveSetting, { isLoading: busy }] = useSaveSettingMutation()

  const current = setting.isSecret ? '' : (setting.value ?? '')
  const changed = draft.trim() !== current

  async function save(value: string) {
    setError('')
    setSaved('')
    try {
      const next = await saveSetting({ key: setting.key, value }).unwrap()
      const updated = next.settings.find((s) => s.key === setting.key)
      setDraft(setting.isSecret ? '' : (updated?.value ?? ''))
      setSaved(value ? 'Saved.' : 'Removed.')
    } catch (e) {
      setError(failureOf(e).validationErrors?.value?.[0] ?? "That couldn't be saved. Please try again.")
    }
  }

  return {
    id: useId(),
    draft,
    setDraft,
    error,
    saved,
    busy,
    sourceText: sourceText(setting),
    placeholder: setting.isSecret ? (setting.isSet ? 'Paste a new value to replace it' : 'Paste it here') : placeholder,
    canSave: !busy && changed && !(setting.isSecret && !draft.trim()),
    canRemove: setting.source === 'settings',
    save: () => void save(draft.trim()),
    remove: () => void save(''),
  }
}
