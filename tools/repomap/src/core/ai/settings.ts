/**
 * The assistant's settings, kept on this machine (never in the repository): the provider, its API key,
 * the model, effort and permission mode. The key is written to a file only its owner can read and is
 * never sent to the browser - the viewer sees a hint ("sk-ant-…a1b2"). Without a stored key, the
 * server's ANTHROPIC_API_KEY is used.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { AI_PROVIDERS, DEFAULT_MODEL, EFFORTS, keyHint, type AiProviderId, type AiSettingsUpdate, type AiSettingsView, type Effort, type PermissionMode } from '../../shared/ai.ts'

export interface AiSettings {
  provider: AiProviderId
  apiKeys: Partial<Record<AiProviderId, string>>
  model: string
  effort: Effort
  permissionMode: PermissionMode
}

const DEFAULTS: AiSettings = { provider: 'anthropic', apiKeys: {}, model: DEFAULT_MODEL, effort: 'high', permissionMode: 'ask' }

/** ~/.config/repomap/settings.json (REPOMAP_SETTINGS overrides it). */
export function defaultSettingsPath(): string {
  return process.env.REPOMAP_SETTINGS || join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'repomap', 'settings.json')
}

export class SettingsError extends Error {}

export class SettingsStore {
  readonly path: string
  private readonly env: NodeJS.ProcessEnv

  constructor(path = defaultSettingsPath(), env: NodeJS.ProcessEnv = process.env) {
    this.path = path
    this.env = env
  }

  read(): AiSettings {
    if (!existsSync(this.path)) return structuredClone(DEFAULTS)
    try {
      const stored = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<AiSettings>
      return { ...structuredClone(DEFAULTS), ...stored, apiKeys: { ...(stored.apiKeys ?? {}) } }
    } catch {
      return structuredClone(DEFAULTS)
    }
  }

  /** The key to call the provider with, or undefined. */
  apiKey(settings = this.read()): string | undefined {
    const stored = settings.apiKeys[settings.provider]?.trim()
    if (stored) return stored
    if (settings.provider === 'anthropic') return this.env.ANTHROPIC_API_KEY?.trim() || undefined
    return undefined
  }

  view(settings = this.read()): AiSettingsView {
    const stored = settings.apiKeys[settings.provider]?.trim()
    const key = this.apiKey(settings)
    return {
      provider: settings.provider,
      hasKey: !!key,
      keyHint: key ? keyHint(key) : null,
      keySource: stored ? 'settings' : key ? 'environment' : null,
      settingsPath: this.path,
      model: settings.model,
      effort: settings.effort,
      permissionMode: settings.permissionMode,
    }
  }

  update(update: AiSettingsUpdate): AiSettingsView {
    const settings = this.read()
    if (update.provider !== undefined) {
      const provider = AI_PROVIDERS.find((p) => p.id === update.provider)
      if (!provider) throw new SettingsError(`Unknown provider ${String(update.provider)}`)
      if (!provider.available) throw new SettingsError(`${provider.label} is not supported yet`)
      settings.provider = provider.id
    }
    if (update.apiKey !== undefined) {
      if (typeof update.apiKey !== 'string') throw new SettingsError('apiKey must be text')
      const key = update.apiKey.trim()
      if (key && /\s/.test(key)) throw new SettingsError('An API key has no spaces')
      if (key.length > 500) throw new SettingsError('That is not an API key')
      if (key) settings.apiKeys[settings.provider] = key
      else delete settings.apiKeys[settings.provider]
    }
    if (update.model !== undefined) {
      if (typeof update.model !== 'string' || !/^[a-z0-9][a-z0-9.@:_-]{1,100}$/i.test(update.model)) throw new SettingsError('Invalid model id')
      settings.model = update.model
    }
    if (update.effort !== undefined) {
      if (!EFFORTS.includes(update.effort)) throw new SettingsError('Invalid effort')
      settings.effort = update.effort
    }
    if (update.permissionMode !== undefined) {
      if (!['ask', 'edits', 'auto'].includes(update.permissionMode)) throw new SettingsError('Invalid permission mode')
      settings.permissionMode = update.permissionMode
    }
    this.write(settings)
    return this.view(settings)
  }

  private write(settings: AiSettings): void {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
    // Only the owner may read it: it holds API keys.
    writeFileSync(this.path, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 })
    chmodSync(this.path, 0o600)
  }
}
