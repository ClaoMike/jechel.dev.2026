/**
 * Settings: the AI provider and its API key (kept by repomap on this machine, never shown again), the
 * model, how hard it thinks, and what it may do without asking.
 */
import { useEffect, useRef, useState } from 'react'
import { AI_PROVIDERS, EFFORTS, type AiProviderId, type Effort, type PermissionMode } from '../../../src/shared/ai.ts'
import { Field } from '../ui/Dialog.tsx'
import { Icon } from '../ui/icons.tsx'
import { useAssistant } from './store.ts'

const EFFORT_HINTS: Record<Effort, string> = {
  low: 'Fastest and cheapest; fine for questions and small edits',
  medium: 'Balanced',
  high: 'Thorough (recommended for code changes)',
  xhigh: 'More thorough, for tricky multi-file work',
  max: 'As much as it takes; slowest and most expensive',
}

const MODES: { value: PermissionMode; label: string; hint: string }[] = [
  { value: 'ask', label: 'Ask before changes', hint: 'Claude reads freely; every edit, git and shell command waits for your OK.' },
  { value: 'edits', label: 'Accept edits', hint: 'File edits run by themselves; git and shell commands still ask.' },
  { value: 'auto', label: 'Auto', hint: 'Everything runs without asking. You still see every step.' },
]

/** Claude Code can't stop and ask: each mode is what it may do on its own. */
const CLAUDE_CODE_HINTS: Record<PermissionMode, string> = {
  ask: 'Read only: it reads, searches and looks in the map; edits and commands are declined (you see which).',
  edits: 'It also edits files; shell commands (git included) are declined.',
  auto: 'Edits and shell commands, git included, all without asking. You still see every step.',
}

export function SettingsDialog() {
  const open = useAssistant((s) => s.settingsOpen)
  if (!open) return null
  return <Settings />
}

function Settings() {
  const settings = useAssistant((s) => s.settings)
  const models = useAssistant((s) => s.models)
  const modelsError = useAssistant((s) => s.modelsError)
  const error = useAssistant((s) => s.error)
  const { setSettingsOpen, saveSettings, loadModels } = useAssistant.getState()
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const close = () => setSettingsOpen(false)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>('input, select, button')?.focus()
    // Escape closes it wherever the focus is (saving disables the button, and the focus falls to the page).
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [])

  if (!settings) return null
  const modelInfo = models?.find((m) => m.id === settings.model)
  const efforts = modelInfo?.efforts.length ? modelInfo.efforts : EFFORTS

  const saveKey = async () => {
    setSaving(true)
    if (await saveSettings({ apiKey: key })) setKey('')
    setSaving(false)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={panel}
        className="modal settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        data-testid="settings"
      >
        <header>
          <h2 id="settings-title">Settings</h2>
          <button type="button" className="icon-button" onClick={close} aria-label="Close settings">
            <Icon name="close" />
          </button>
        </header>
        <div className="dialog-body">
          <section className="settings-section">
            <h3>
              <Icon name="sparkle" size={15} /> AI assistant
            </h3>
            <Field label="Provider" hint="Claude Code uses your Claude subscription through the claude command on this computer; the API bills a key per token.">
              <select value={settings.provider} onChange={(e) => void saveSettings({ provider: e.target.value as AiProviderId })} data-testid="provider-select">
                {AI_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.available}>
                    {p.label}
                    {p.available ? '' : ' (coming later)'}
                  </option>
                ))}
              </select>
            </Field>

            {settings.provider === 'claude-code' ? (
              <div className="field" data-testid="claude-code-status">
                <span className="field-label">Claude Code</span>
                {settings.cliPath ? (
                  <div className="key-status">
                    <Icon name="check" size={14} />
                    <span>
                      Found <code>{settings.cliPath}</code>
                    </span>
                  </div>
                ) : (
                  <p className="field-error" role="alert">
                    The <code>claude</code> command isn't on this computer's PATH. Install Claude Code and sign in (run <code>claude</code> once), then reopen Settings.
                  </p>
                )}
                <span className="field-hint">
                  The assistant runs Claude Code in your repository with its own tools, and the Board's summaries and briefings go through it too: all on your subscription, signed in as you are in the terminal. It can't stop to ask, so the
                  choice below decides what it may do — on top of your own Claude Code permissions for this repository (<code>.claude/settings*.json</code>), which can allow more.
                </span>
              </div>
            ) : (
            <div className="field">
              <span className="field-label">API key</span>
              {settings.hasKey && (
                <div className="key-status" data-testid="key-status">
                  <Icon name="check" size={14} />
                  <span>
                    <code>{settings.keyHint}</code> {settings.keySource === 'environment' ? '(from ANTHROPIC_API_KEY on the server)' : 'saved'}
                  </span>
                  {settings.keySource === 'settings' && (
                    <button type="button" className="link-button" onClick={() => void saveSettings({ apiKey: '' })} data-testid="remove-key">
                      Remove
                    </button>
                  )}
                </div>
              )}
              <form
                className="key-row"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (key.trim()) void saveKey()
                }}
              >
                <input
                  type="password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={settings.hasKey ? 'Paste a new key to replace it' : 'sk-ant-…'}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Anthropic API key"
                  data-testid="api-key"
                />
                <button type="submit" className="button primary" disabled={!key.trim() || saving}>
                  {saving ? 'Saving…' : 'Save key'}
                </button>
              </form>
              <span className="field-hint">
                Create one at{' '}
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer noopener">
                  console.anthropic.com
                </a>
                . repomap keeps it in <code>{settings.settingsPath}</code> on this machine (readable only by you) and sends it only to Anthropic; this page never sees it again.
              </span>
            </div>
            )}

            {settings.hasKey && (
              <>
                <Field label="Model" hint={modelsError ? undefined : modelInfo?.contextWindow ? `${modelInfo.contextWindow >= 1_000_000 ? `${modelInfo.contextWindow / 1_000_000}M` : `${Math.round(modelInfo.contextWindow / 1000)}K`} context` : undefined} error={modelsError}>
                  <select value={settings.model} onChange={(e) => void saveSettings({ model: e.target.value })} data-testid="settings-model">
                    {(models ?? [{ id: settings.model, name: settings.model }]).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {modelsError && (
                  <button type="button" className="link-button" onClick={() => void loadModels()}>
                    <Icon name="reset" size={13} /> Try again
                  </button>
                )}
                <fieldset className="radio-group">
                  <legend className="field-label">Effort</legend>
                  <div className="segmented effort-picker" role="group" aria-label="Effort">
                    {efforts.map((level) => (
                      <button key={level} type="button" className={settings.effort === level ? 'active' : ''} aria-pressed={settings.effort === level} onClick={() => void saveSettings({ effort: level })} title={EFFORT_HINTS[level]}>
                        {level}
                      </button>
                    ))}
                  </div>
                  <span className="field-hint">{EFFORT_HINTS[settings.effort]}</span>
                </fieldset>
                <fieldset className="radio-group">
                  <legend className="field-label">Without asking, Claude may</legend>
                  {MODES.map((mode) => (
                    <label key={mode.value} className={`radio-field${mode.value === 'auto' ? ' danger' : ''}`}>
                      <input type="radio" name="permission-mode" checked={settings.permissionMode === mode.value} onChange={() => void saveSettings({ permissionMode: mode.value })} />
                      <span>
                        <strong>{mode.label}</strong> — {settings.provider === 'claude-code' ? CLAUDE_CODE_HINTS[mode.value] : mode.hint}
                      </span>
                    </label>
                  ))}
                </fieldset>
              </>
            )}
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
