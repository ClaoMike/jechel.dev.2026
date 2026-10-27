/**
 * The assistant's chat, docked at the bottom of every view (the map, the history, the code editor).
 * ⌘J shows and hides it; dragging its top edge resizes it. What you are looking at is attached as
 * chips (take one off with a click); every step Claude takes shows up, and changes wait for approval.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { ChatItem, ContextItem, PermissionMode, ToolStep } from '../../../src/shared/ai.ts'
import { diffStats } from '../../../src/shared/diff.ts'
import { useGitActions } from '../git/actions.ts'
import { relativeTime } from '../git/model.ts'
import { useGit } from '../git/store.ts'
import { useEditor } from '../model/editor.ts'
import { useBoard } from '../board/store.ts'
import { useViewer } from '../model/store.ts'
import { ActionMenu, type MenuItem } from '../ui/ActionMenu.tsx'
import { Icon, type IconName } from '../ui/icons.tsx'
import { gatherContext } from './context.ts'
import { Markdown } from './Markdown.tsx'
import { useAssistant } from './store.ts'

const MODES: { value: PermissionMode; label: string; hint: string }[] = [
  { value: 'ask', label: 'Ask before changes', hint: 'Reads run freely; edits, git and shell commands wait for your OK' },
  { value: 'edits', label: 'Accept edits', hint: 'File edits run by themselves; git and shell commands still ask' },
  { value: 'auto', label: 'Auto', hint: 'Everything runs without asking (you still see every step)' },
]

/** What the user is looking at right now, as context items. */
export function useCurrentContext(): ContextItem[] {
  const tab = useViewer((s) => s.tab)
  const index = useViewer((s) => s.index)
  const mapSelected = useViewer((s) => s.selected)
  // On the Board, the selected chip (a node) is what you're looking at.
  const boardChip = useBoard((s) => (s.selected && !s.selected.startsWith('wire:') ? s.selected : null))
  const boardNode = boardChip && index ? (index.byId.get(boardChip) ?? null) : null
  const selected = tab === 'board' ? boardNode : mapSelected
  const editor = useEditor()
  const commit = useGit((s) => s.selected)
  const model = useGit((s) => s.model)
  const live = useGitActions((s) => s.live)
  return useMemo(
    () =>
      gatherContext({
        tab,
        index,
        selectedNode: selected,
        editor,
        selectedCommit: commit,
        commit: commit && model ? model.byHash.get(commit) : undefined,
        changes: live ? { files: live.files, branch: live.branch } : undefined,
      }),
    [tab, index, selected, editor, commit, model, live],
  )
}

export function ChatDock() {
  const available = useAssistant((s) => s.available)
  const open = useAssistant((s) => s.open)
  const height = useAssistant((s) => s.height)

  // The rest of the page makes room for the dock.
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--dock-h', available && open ? `${height}px` : '0px')
  }, [available, open, height])

  if (!available || !open) return null
  return <Dock height={height} />
}

function Dock({ height }: { height: number }) {
  const settings = useAssistant((s) => s.settings)
  const models = useAssistant((s) => s.models)
  const items = useAssistant((s) => s.items)
  const running = useAssistant((s) => s.running)
  const title = useAssistant((s) => s.title)
  const conversations = useAssistant((s) => s.conversations)
  const conversationId = useAssistant((s) => s.conversationId)
  const error = useAssistant((s) => s.error)
  const { setOpen, setHeight, setSettingsOpen, saveSettings, newChat, openChat, deleteChat } = useAssistant.getState()
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  // Follow the answer as it streams, unless the user scrolled up to read.
  useLayoutEffect(() => {
    const element = scroller.current
    if (element && stick.current) element.scrollTop = element.scrollHeight
  }, [items, running])

  const startResize = (event: ReactPointerEvent) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = height
    const move = (e: PointerEvent) => setHeight(startHeight + (startY - e.clientY))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const chatItems: MenuItem[] = [
    { label: 'New chat', icon: 'plus', disabled: running, onSelect: newChat },
    ...(conversations.length ? [{ heading: 'Recent chats' } satisfies MenuItem] : []),
    ...conversations.slice(0, 15).map<MenuItem>((chat) => ({
      label: chat.title,
      icon: chat.id === conversationId ? 'check' : 'clock',
      hint: relativeTime(Date.parse(chat.updatedAt) / 1000),
      disabled: running,
      onSelect: () => void openChat(chat.id),
    })),
    ...(conversationId ? [{ separator: true } satisfies MenuItem, { label: 'Delete this chat', icon: 'trash', danger: true, disabled: running, onSelect: () => void deleteChat(conversationId) } satisfies MenuItem] : []),
  ]
  const modelOptions = models?.length ? models : settings ? [{ id: settings.model, name: settings.model }] : []

  return (
    <section className="assistant-dock" style={{ height }} aria-label="Assistant" data-testid="assistant">
      <div className="dock-resize" onPointerDown={startResize} role="separator" aria-orientation="horizontal" aria-label="Resize the assistant" title="Drag to resize" />
      <header className="dock-header">
        <span className="dock-brand">
          <Icon name="sparkle" size={15} /> Assistant
        </span>
        <ActionMenu label="Chats" items={chatItems} className="dock-chats" testId="chat-menu" title="Chats">
          <span className="dock-title">{title ?? 'New chat'}</span>
          <Icon name="caret" size={13} />
        </ActionMenu>
        <span className="dock-spacer" />
        {settings?.hasKey && (
          <>
            <select className="dock-select" aria-label="Model" value={settings.model} onChange={(e) => void saveSettings({ model: e.target.value })} disabled={running} data-testid="model-select">
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select
              className="dock-select"
              aria-label="Permissions"
              value={settings.permissionMode}
              onChange={(e) => void saveSettings({ permissionMode: e.target.value as PermissionMode })}
              title={MODES.find((m) => m.value === settings.permissionMode)?.hint}
              data-testid="mode-select"
            >
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </>
        )}
        <button type="button" className="icon-button small" onClick={newChat} disabled={running} aria-label="New chat" title="New chat">
          <Icon name="plus" size={15} />
        </button>
        <button type="button" className="icon-button small" onClick={() => setSettingsOpen(true)} aria-label="Assistant settings" title="Settings">
          <Icon name="gear" size={15} />
        </button>
        <button type="button" className="icon-button small" onClick={() => setOpen(false)} aria-label="Hide the assistant" title="Hide (⌘J)">
          <Icon name="down" size={15} />
        </button>
      </header>
      <div
        ref={scroller}
        className="dock-body"
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
        data-testid="chat-log"
        aria-live="polite"
        aria-busy={running}
      >
        {!settings?.hasKey ? (
          <div className="dock-empty">
            <Icon name="sparkle" size={22} />
            <p>
              <strong>Connect Claude</strong> to ask about this repository and have it make changes for you.
            </p>
            <button type="button" className="button primary" onClick={() => setSettingsOpen(true)}>
              Add an API key
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="dock-empty">
            <Icon name="sparkle" size={22} />
            <p>Ask about the code, or tell Claude what to change. What you are looking at is attached below; it sees the map, the files and the git history.</p>
          </div>
        ) : (
          items.map((item) => <Item key={item.id} item={item} />)
        )}
        {running && (
          <div className="dock-working" role="status">
            <span className="spinner small" aria-hidden="true" /> Claude is working…
          </div>
        )}
        {error && (
          <div className="git-banner error" role="alert">
            <Icon name="warn" size={15} />
            <span>{error}</span>
          </div>
        )}
      </div>
      {settings?.hasKey && <Composer />}
    </section>
  )
}

function Composer() {
  const running = useAssistant((s) => s.running)
  const excluded = useAssistant((s) => s.excluded)
  const focusNonce = useAssistant((s) => s.focusNonce)
  const { send, stop, toggleContext } = useAssistant.getState()
  const context = useCurrentContext()
  const [text, setText] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (focusNonce) input.current?.focus()
  }, [focusNonce])

  const submit = () => {
    if (!text.trim() || running) return
    const attached = context.filter((item) => !excluded.includes(item.kind))
    void send(text, attached)
    setText('')
  }
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="dock-composer">
      {context.length > 0 && (
        <div className="context-chips" role="group" aria-label="Attached context" data-testid="context-chips">
          {context.map((item) => {
            const off = excluded.includes(item.kind)
            return (
              <button
                key={item.kind}
                type="button"
                className={`context-chip${off ? ' off' : ''}`}
                aria-pressed={!off}
                onClick={() => toggleContext(item.kind)}
                title={off ? 'Not attached - click to attach' : `Attached:\n${item.text.slice(0, 400)}`}
              >
                <Icon name={CONTEXT_ICONS[item.kind] ?? 'file'} size={12} />
                {item.label}
                {!off && <Icon name="close" size={11} />}
              </button>
            )
          })}
        </div>
      )}
      <div className="composer-row">
        <textarea
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={running ? 'Claude is working… (you can type the next message)' : 'Ask Claude, or tell it what to do (Enter sends, Shift+Enter: new line)'}
          rows={2}
          aria-label="Message to Claude"
          data-testid="chat-input"
        />
        {running ? (
          <button type="button" className="button stop-button" onClick={() => void stop()} data-testid="chat-stop">
            <Icon name="stop" size={14} /> Stop
          </button>
        ) : (
          <button type="button" className="button primary" onClick={submit} disabled={!text.trim()} data-testid="chat-send" aria-label="Send">
            <Icon name="send" size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

const CONTEXT_ICONS: Record<string, IconName> = { node: 'layers', file: 'file', selection: 'code', commit: 'commit', changes: 'git' }

function Item({ item }: { item: ChatItem }) {
  switch (item.type) {
    case 'user':
      return (
        <div className="chat-user" data-testid="chat-user">
          <p>{item.text}</p>
          {item.context.length > 0 && (
            <div className="chat-user-context">
              {item.context.map((c) => (
                <span key={c.kind} className="context-chip static" title={c.text.slice(0, 400)}>
                  <Icon name={CONTEXT_ICONS[c.kind] ?? 'file'} size={11} /> {c.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )
    case 'assistant':
      return (
        <div className="chat-assistant" data-testid="chat-assistant">
          {item.thinking && (
            <details className="chat-thinking">
              <summary>Thinking</summary>
              <p>{item.thinking}</p>
            </details>
          )}
          {item.text && <Markdown text={item.text} />}
        </div>
      )
    case 'tool':
      return <ToolItem step={item.step} />
    case 'notice':
      return (
        <div className={`chat-notice ${item.level}`} role={item.level === 'error' ? 'alert' : undefined}>
          {item.level !== 'info' && <Icon name="warn" size={13} />} {item.text}
        </div>
      )
  }
}

const CLASS_ICONS: Record<ToolStep['class'], IconName> = { read: 'search', edit: 'edit', git: 'git', shell: 'code' }
const CLASS_NAMES: Record<ToolStep['class'], string> = { read: 'reads', edit: 'file changes', git: 'git commands', shell: 'shell commands' }

function ToolItem({ step }: { step: ToolStep }) {
  const [expanded, setExpanded] = useState(false)
  const { approve } = useAssistant.getState()
  const waiting = step.status === 'waiting'
  const stats = step.diff ? diffStats(step.diff) : null
  const command = step.name === 'bash' ? (step.input as { command?: string })?.command : undefined
  const hasDetails = !!(step.diff || step.output || command)
  const show = waiting || expanded
  return (
    <div className={`chat-tool ${step.status}${waiting ? ' waiting' : ''}`} data-testid="chat-tool" data-status={step.status}>
      <button type="button" className="chat-tool-head" onClick={() => setExpanded(!expanded)} aria-expanded={show} disabled={!hasDetails || waiting}>
        <span className="chat-tool-icon" aria-hidden="true">
          {step.status === 'running' ? <span className="spinner small" /> : <Icon name={step.status === 'error' || step.status === 'denied' ? 'close' : CLASS_ICONS[step.class]} size={13} />}
        </span>
        <span className="chat-tool-title">{step.title}</span>
        {stats && (
          <span className="delta">
            <span className="adds">+{stats.added}</span> <span className="dels">−{stats.removed}</span>
          </span>
        )}
        {step.status === 'denied' && <span className="chat-tool-state">declined</span>}
        {step.status === 'error' && <span className="chat-tool-state">failed</span>}
      </button>
      {show && command && <pre className="chat-tool-command">$ {command}</pre>}
      {show && step.diff && <DiffView diff={step.diff} />}
      {show && step.output && !waiting && <pre className="chat-tool-output">{step.output}</pre>}
      {waiting && (
        <div className="chat-approval" role="group" aria-label={`Approve: ${step.title}`}>
          <span>Allow Claude to {step.title.charAt(0).toLowerCase() + step.title.slice(1)}?</span>
          <button type="button" className="button primary" onClick={() => void approve(step.id, 'allow')} data-testid="approve-allow">
            Allow
          </button>
          <button type="button" className="button" onClick={() => void approve(step.id, 'always')} data-testid="approve-always" title={`Don't ask again for ${CLASS_NAMES[step.class]} in this chat`}>
            Allow {CLASS_NAMES[step.class]} in this chat
          </button>
          <button type="button" className="button" onClick={() => void approve(step.id, 'deny')} data-testid="approve-deny">
            Deny
          </button>
        </div>
      )}
    </div>
  )
}

function DiffView({ diff }: { diff: string }) {
  const lines = diff.split('\n').filter((line) => !line.startsWith('---') && !line.startsWith('+++'))
  return (
    <pre className="chat-diff" aria-label="Changes">
      {lines.map((line, k) => (
        <span key={k} className={line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : line.startsWith('@@') ? 'hunk' : ''}>
          {line}
          {'\n'}
        </span>
      ))}
    </pre>
  )
}
