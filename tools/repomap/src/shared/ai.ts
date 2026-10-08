/**
 * The AI assistant's contract between `repomap serve` (which holds the API key and runs the agent)
 * and the viewer (settings page, chat dock). Isomorphic.
 */

/** Providers the settings page offers; only the available ones can be chosen. */
export const AI_PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic (Claude)', available: true },
  { id: 'openai', label: 'OpenAI', available: false },
  { id: 'google', label: 'Google Gemini', available: false },
] as const

export type AiProviderId = (typeof AI_PROVIDERS)[number]['id']

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

/**
 * What the assistant may do without asking:
 *   ask   - reads only; every edit, file operation, git command and shell command asks first
 *   edits - also edits, creates, renames and deletes files; git and shell commands still ask
 *   auto  - everything (you still see every step)
 */
export type PermissionMode = 'ask' | 'edits' | 'auto'

export const DEFAULT_MODEL = 'claude-opus-5-5'

/** The settings as the viewer sees them: never the key itself. */
export interface AiSettingsView {
  provider: AiProviderId
  /** A key is configured (in the settings file, or ANTHROPIC_API_KEY for the server). */
  hasKey: boolean
  /** e.g. "sk-ant-…a1b2". */
  keyHint: string | null
  keySource: 'settings' | 'environment' | null
  /** Where the settings file lives on this machine. */
  settingsPath: string
  model: string
  effort: Effort
  permissionMode: PermissionMode
}

export interface AiSettingsUpdate {
  provider?: AiProviderId
  /** A new key; "" removes the stored one. */
  apiKey?: string
  model?: string
  effort?: Effort
  permissionMode?: PermissionMode
}

export interface AiModel {
  id: string
  name: string
  contextWindow: number | null
  maxOutput: number | null
  efforts: Effort[]
}

/** Something the user is looking at, attached to a message (a chip in the chat). */
export interface ContextItem {
  /** Stable per source, e.g. "file", "selection", "node", "commit", "changes". */
  kind: string
  /** Chip text, e.g. "BookCard.tsx:5–9". */
  label: string
  /** What the assistant reads. */
  text: string
}

/** Kinds of tools, for permissions and for the chat's rendering. */
export type ToolClass = 'read' | 'edit' | 'git' | 'shell'

/** One step of the assistant's work, as the chat shows it. */
export interface ToolStep {
  id: string
  name: string
  class: ToolClass
  /** One line: "Read web/src/App.tsx", "Run npm test". */
  title: string
  input: unknown
  status: 'running' | 'waiting' | 'done' | 'error' | 'denied'
  /** Output shown under the step (truncated). */
  output?: string
  /** For edits: a unified diff of the change. */
  diff?: string
}

/** A transcript entry as the chat renders it. */
export type ChatItem =
  | { type: 'user'; id: string; text: string; context: ContextItem[] }
  | { type: 'assistant'; id: string; text: string; thinking?: string; model?: string }
  | { type: 'tool'; id: string; step: ToolStep }
  | { type: 'notice'; id: string; level: 'info' | 'warn' | 'error'; text: string }

export interface ConversationSummary {
  id: string
  title: string
  updatedAt: string
  model: string
}

export interface Conversation extends ConversationSummary {
  items: ChatItem[]
}

/** What the server streams (NDJSON) while the assistant works on a message. */
export type ChatEvent =
  | { type: 'start'; conversation: ConversationSummary; user: ChatItem }
  | { type: 'text'; itemId: string; text: string }
  | { type: 'thinking'; itemId: string; text: string }
  | { type: 'model'; itemId: string; model: string }
  | { type: 'tool'; step: ToolStep }
  | { type: 'approval'; step: ToolStep }
  | { type: 'notice'; item: Extract<ChatItem, { type: 'notice' }> }
  | { type: 'files'; paths: string[] }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cacheReadTokens: number }
  | { type: 'done'; stopReason: string }
  | { type: 'error'; message: string }

export type ApprovalDecision = 'allow' | 'deny' | 'always'

/** "sk-ant-api03-…" → "sk-ant-…a1b2". */
export function keyHint(key: string): string {
  const trimmed = key.trim()
  if (trimmed.length <= 12) return '…'
  return `${trimmed.slice(0, 7)}…${trimmed.slice(-4)}`
}

/** Whether a mode lets a tool of this class run without asking. */
export function allowedWithoutAsking(mode: PermissionMode, toolClass: ToolClass): boolean {
  if (toolClass === 'read') return true
  if (mode === 'auto') return true
  return mode === 'edits' && toolClass === 'edit'
}
