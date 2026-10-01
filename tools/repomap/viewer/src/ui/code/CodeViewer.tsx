/**
 * Source of a node's file in an editor coloured like VS Code. Loaded lazily (the editor and each
 * language grammar are separate chunks).
 *
 * When `repomap serve` allows it (your own repository, on localhost), the file can be edited and is
 * saved automatically (a moment after you stop typing, on ⌘S, and when closing). A file changed on
 * disk meanwhile is never overwritten silently: unedited, it is reloaded; edited, you choose.
 */
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, codeFolding, foldGutter, foldKeymap, indentOnInput } from '@codemirror/language'
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { Annotation, Compartment, EditorState, RangeSet, RangeSetBuilder, StateField, type Extension, type Text } from '@codemirror/state'
import {
  Decoration,
  drawSelection,
  EditorView,
  gutterLineClass,
  GutterMarker,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  type DecorationSet,
} from '@codemirror/view'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { GraphNode } from '../../../../src/shared/types.ts'
import { FILES_CHANGED_EVENT, useAssistant } from '../../ai/store.ts'
import { Autosaver, type AutosaveState } from '../../model/autosave.ts'
import { useEditor } from '../../model/editor.ts'
import { onServerEvent } from '../../model/events.ts'
import { fetchSource, saveSource, type SourceFile } from '../../model/source.ts'
import { useViewer } from '../../model/store.ts'
import { Icon, ShapeIcon } from '../icons.tsx'
import { LANGUAGE_NAMES, languageOf } from './languages.ts'
import { loadLanguage } from './loaders.ts'
import { vscodeTheme } from './theme.ts'

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; file: SourceFile; language: Extension | null }

export default function CodeViewer() {
  const codeView = useViewer((s) => s.codeView)
  const index = useViewer((s) => s.index)
  if (!codeView || !index) return null
  // After a rebuild the node may be gone (renamed in the editor): keep showing the file.
  const node = (codeView.node !== null ? index.nodes[codeView.node] : undefined) ?? codeView.opened
  return <CodePanel key={codeView.opened.id} node={node} />
}

/** Marks edits that came from disk (a reload), which must not be saved back. */
const fromDisk = Annotation.define<boolean>()

class TargetMarker extends GutterMarker {
  elementClass = 'cm-target-gutter'
}
const targetMarker = new TargetMarker()

/**
 * Highlights the node's declaration (line..endLine), the first line more strongly. The highlight
 * follows the text as it is edited.
 */
function targetLines(doc: Text, line: number | undefined, endLine: number | undefined): Extension {
  if (!line || line > doc.lines) return []
  const last = Math.min(doc.lines, Math.max(line, endLine ?? line), line + 400)
  const decorations = new RangeSetBuilder<Decoration>()
  const gutter = new RangeSetBuilder<GutterMarker>()
  for (let n = line; n <= last; n++) {
    const from = doc.line(n).from
    decorations.add(from, from, Decoration.line({ class: n === line ? 'cm-target-start' : 'cm-target-line' }))
    gutter.add(from, from, targetMarker)
  }
  const lines = StateField.define<DecorationSet>({
    create: () => decorations.finish(),
    update: (value, tr) => value.map(tr.changes),
    provide: (field) => EditorView.decorations.from(field),
  })
  const markers = StateField.define<RangeSet<GutterMarker>>({
    create: () => gutter.finish(),
    update: (value, tr) => value.map(tr.changes),
  })
  return [lines, markers, gutterLineClass.compute([markers], (state) => state.field(markers))]
}

/** Line breaks of a file as saved: the editor works in \n, the file keeps its own. */
const lineBreakOf = (text: string) => (text.includes('\r\n') ? '\r\n' : '\n')

function CodePanel({ node }: { node: GraphNode }) {
  const index = useViewer((s) => s.index)!
  const theme = useViewer((s) => s.theme)
  const closeCode = useViewer((s) => s.closeCode)
  const file = node.file!
  const language = languageOf(file)
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [wrap, setWrap] = useState(() => window.matchMedia('(max-width: 820px)').matches)
  // On touch screens editing is switched on explicitly (a focused editor pops up the keyboard).
  const [editing, setEditing] = useState(!coarse)
  const [save, setSave] = useState<AutosaveState>({ status: 'saved' })
  const [closeBlocked, setCloseBlocked] = useState(false)
  const [cursor, setCursor] = useState<{ line: number; col: number } | null>(null)
  const [lines, setLines] = useState(0)
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const saver = useRef<Autosaver | null>(null)
  const lineBreak = useRef('\n')
  // Where to highlight: the node as it was when the panel opened (later, the highlight follows the edits).
  const target = useRef({ line: node.line, endLine: node.endLine })
  const compartments = useMemo(() => ({ theme: new Compartment(), wrap: new Compartment(), edit: new Compartment() }), [])
  const kind = index.kinds.get(node.kind)
  const root = index.graph.meta.repo.root
  const editorHref = root ? `vscode://file/${encodeURI(`${root}/${file}`)}${node.line ? `:${node.line}` : ''}` : null
  const writable = load.status === 'ready' && load.file.writable
  const canEdit = writable && editing

  const editExtensions = useCallback(
    (on: boolean): Extension => [
      EditorState.readOnly.of(!on),
      EditorView.editable.of(on || !coarse),
      EditorView.contentAttributes.of({ 'aria-readonly': on ? 'false' : 'true' }),
    ],
    [coarse],
  )

  // Remember what had focus, give it back when closing.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    return () => previous?.focus?.()
  }, [])

  // The assistant knows which file is open (and, once the editor reports it, the cursor and selection).
  useEffect(() => {
    useEditor.setState({ file, cursorLine: target.current.line ?? null, selection: null })
    return () => useEditor.setState({ file: null, cursorLine: null, selection: null })
  }, [file])

  useEffect(() => {
    const controller = new AbortController()
    setLoad({ status: 'loading' })
    Promise.all([fetchSource(file, controller.signal), loadLanguage(language)])
      .then(([source, languageExtension]) => setLoad({ status: 'ready', file: source, language: languageExtension }))
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setLoad({ status: 'error', message: error.message })
      })
    return () => controller.abort()
  }, [file, language])

  // One editor per loaded file: theme, wrapping and editing are switched without rebuilding it (the undo history stays).
  useLayoutEffect(() => {
    if (load.status !== 'ready' || !host.current) return
    const source = load.file
    lineBreak.current = lineBreakOf(source.text)
    const doc = EditorState.create({ doc: source.text }).doc
    const line = target.current.line && target.current.line <= doc.lines ? target.current.line : undefined
    let editor: EditorView | null = null
    const autosaver = source.writable
      ? new Autosaver({
          etag: source.etag,
          read: () => {
            const text = (editor ?? view.current)!.state.doc
            return text.sliceString(0, text.length, lineBreak.current)
          },
          save: (text, etag, keepalive) => saveSource(file, text, etag, { keepalive }),
          onState: setSave,
        })
      : null
    saver.current = autosaver
    const state = EditorState.create({
      doc: source.text,
      selection: line ? { anchor: doc.line(line).from } : undefined,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        codeFolding(),
        drawSelection(),
        indentOnInput(),
        highlightActiveLine(),
        bracketMatching(),
        highlightSelectionMatches(),
        search({ top: true }),
        compartments.edit.of(editExtensions(source.writable && editing)),
        EditorState.tabSize.of(4),
        keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              void saver.current?.flush()
              return true
            },
          },
          ...searchKeymap,
          ...foldKeymap,
          ...historyKeymap,
          ...defaultKeymap,
          indentWithTab,
        ]),
        compartments.theme.of(vscodeTheme(theme === 'dark')),
        compartments.wrap.of(wrap ? EditorView.lineWrapping : []),
        targetLines(doc, line, target.current.endLine),
        load.language ?? [],
        EditorView.contentAttributes.of({ 'aria-label': `Source of ${file}` }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            setLines(update.state.doc.lines)
            if (!update.transactions.some((tr) => tr.annotation(fromDisk))) saver.current?.change()
          }
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head
            const at = update.state.doc.lineAt(head)
            setCursor({ line: at.number, col: head - at.from + 1 })
            // What the assistant sees as "the selection".
            const range = update.state.selection.main
            const from = update.state.doc.lineAt(range.from).number
            const to = update.state.doc.lineAt(range.to).number
            useEditor.setState({ file, cursorLine: at.number, selection: range.empty ? null : { from, to, text: update.state.sliceDoc(range.from, range.to) } })
          }
        }),
      ],
    })
    editor = new EditorView({ state, parent: host.current })
    view.current = editor
    setLines(state.doc.lines)
    setSave({ status: 'saved' })
    if (line) {
      setCursor({ line, col: 1 })
      editor.dispatch({ effects: EditorView.scrollIntoView(doc.line(line).from, { y: 'center' }) })
    }
    if (!coarse) editor.focus()
    return () => {
      // Closing (or reloading) with changes the file doesn't have yet: write them.
      if (autosaver) void autosaver.flush().finally(() => autosaver.dispose())
      editor.destroy()
      view.current = null
      saver.current = null
    }
    // Only on a new load: theme, wrapping and editing are reconfigured below.
  }, [load])

  useEffect(() => {
    view.current?.dispatch({ effects: compartments.theme.reconfigure(vscodeTheme(theme === 'dark')) })
  }, [theme, compartments])

  useEffect(() => {
    view.current?.dispatch({ effects: compartments.wrap.reconfigure(wrap ? EditorView.lineWrapping : []) })
  }, [wrap, compartments])

  useEffect(() => {
    view.current?.dispatch({ effects: compartments.edit.reconfigure(editExtensions(canEdit)) })
  }, [canEdit, compartments, editExtensions])

  /** The file changed on disk (a checkout, a pull, another editor): show it, unless there are edits to keep. */
  const checkDisk = useCallback(async () => {
    const autosaver = saver.current
    if (!autosaver || autosaver.dirty || autosaver.status === 'saving' || autosaver.status === 'conflict') return
    let latest: SourceFile
    try {
      latest = await fetchSource(file)
    } catch {
      return
    }
    const editor = view.current
    if (!editor || saver.current !== autosaver || autosaver.dirty || latest.etag === autosaver.etag) return
    const next = EditorState.create({ doc: latest.text }).doc.toString()
    const current = editor.state.doc.toString()
    if (next !== current) {
      // Replace only what differs, so the cursor and scroll position stay where they were.
      let start = 0
      while (start < next.length && start < current.length && next[start] === current[start]) start++
      let end = 0
      while (end < next.length - start && end < current.length - start && next[next.length - 1 - end] === current[current.length - 1 - end]) end++
      editor.dispatch({ changes: { from: start, to: current.length - end, insert: next.slice(start, next.length - end) }, annotations: fromDisk.of(true) })
      useViewer.getState().notify(`${file.split('/').pop()} changed on disk: reloaded`)
    }
    lineBreak.current = lineBreakOf(latest.text)
    autosaver.reloaded(latest.etag)
  }, [file])

  useEffect(() => {
    if (!writable) return
    const offGraph = onServerEvent('graph', () => void checkDisk())
    const offGit = onServerEvent('git', () => void checkDisk())
    const onFocus = () => void checkDisk()
    window.addEventListener('focus', onFocus)
    // The assistant edited files: show its changes.
    window.addEventListener(FILES_CHANGED_EVENT, onFocus)
    return () => {
      offGraph()
      offGit()
      window.removeEventListener('focus', onFocus)
      window.removeEventListener(FILES_CHANGED_EVENT, onFocus)
    }
  }, [writable, checkDisk])

  // Leaving the page: save what's left (and let the browser ask while it isn't saved).
  useEffect(() => {
    if (!writable) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!saver.current?.dirty) return
      void saver.current.flush(true)
      event.preventDefault()
    }
    const hidden = () => {
      if (document.visibilityState === 'hidden' && saver.current?.dirty) void saver.current.flush(true)
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [writable])

  /** Closes once everything is saved; when saving fails the panel stays open and says why. */
  const close = useCallback(async () => {
    const autosaver = saver.current
    if (autosaver && (autosaver.dirty || autosaver.status === 'saving')) {
      if (!(await autosaver.flush())) {
        setCloseBlocked(true)
        return
      }
    }
    closeCode()
  }, [closeCode])

  const reloadFromDisk = useCallback(async () => {
    const autosaver = saver.current
    const editor = view.current
    if (!autosaver || !editor) return
    try {
      const latest = await fetchSource(file)
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: latest.text }, annotations: fromDisk.of(true) })
      lineBreak.current = lineBreakOf(latest.text)
      autosaver.reloaded(latest.etag)
      setCloseBlocked(false)
    } catch (error) {
      setSave({ status: 'error', error: (error as Error).message })
    }
  }, [file])

  // Escape closes, wherever the focus is (Safari leaves it on the page after a click on a button).
  // The editor's own search panel takes it first (and marks the event handled).
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) void close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const parts = file.split('/')
  const name = parts.pop()!
  return (
    <div className="code-backdrop" onMouseDown={(e) => e.target === e.currentTarget && void close()} role="presentation">
      <div className={`code-dialog code-${theme}`} role="dialog" aria-modal="true" aria-label={`Code of ${node.label}`} data-testid="code-viewer">
        <header className="code-header">
          <div className="code-title">
            {kind && <ShapeIcon shape={kind.shape} color={kind.color} size={16} />}
            <span className="code-node" title={node.id}>
              {node.label}
            </span>
            {kind && <span className="code-kind">{kind.label}</span>}
            {writable && save.status !== 'saved' && save.status !== 'saving' && (
              <span className="code-dirty" title="Not saved yet" aria-hidden="true">
                ●
              </span>
            )}
          </div>
          <div className="code-path" title={file}>
            <span className="code-dir">{parts.length > 0 ? `${parts.join('/')}/` : ''}</span>
            <strong>{name}</strong>
            {node.line ? <span className="code-dir">:{node.line}</span> : null}
          </div>
          <div className="code-actions">
            <AskClaude />
            {writable && (
              <button
                type="button"
                className={`code-button${editing ? ' active' : ''}`}
                onClick={() => {
                  setEditing(!editing)
                  if (!editing) requestAnimationFrame(() => view.current?.focus())
                }}
                title={editing ? 'Editing (changes are saved automatically)' : 'Edit this file'}
                aria-pressed={editing}
                aria-label="Edit"
                data-testid="code-edit"
              >
                <Icon name="edit" size={15} />
              </button>
            )}
            <button type="button" className="code-button" onClick={() => view.current && openSearchPanel(view.current)} disabled={load.status !== 'ready'} title="Find (⌘F)" aria-label="Find in file">
              <Icon name="search" size={15} />
            </button>
            <button type="button" className={`code-button${wrap ? ' active' : ''}`} onClick={() => setWrap(!wrap)} title="Word wrap" aria-pressed={wrap} aria-label="Word wrap">
              <Icon name="wrap" size={15} />
            </button>
            <button type="button" className="code-button" onClick={() => void navigator.clipboard?.writeText(`${file}${node.line ? `:${node.line}` : ''}`)} title="Copy path" aria-label="Copy path">
              <Icon name="copy" size={15} />
            </button>
            {editorHref && (
              <a className="code-button" href={editorHref} title="Open in VS Code" aria-label="Open in VS Code">
                <Icon name="external" size={15} />
              </a>
            )}
            <button type="button" className="code-button" onClick={() => void close()} title="Close (Esc)" aria-label="Close code">
              <Icon name="close" size={16} />
            </button>
          </div>
        </header>
        {writable && save.status === 'conflict' && (
          <div className="code-banner warn" role="alert" data-testid="save-conflict">
            <Icon name="warn" size={15} />
            <span>
              <strong>{name} changed on disk.</strong> Your edits are not saved.
            </span>
            <button type="button" className="code-banner-button" onClick={() => void reloadFromDisk()}>
              Load the disk version
            </button>
            <button type="button" className="code-banner-button primary" onClick={() => void saver.current?.overwrite().then((ok) => ok && setCloseBlocked(false))}>
              Keep mine
            </button>
          </div>
        )}
        {writable && save.status === 'error' && (
          <div className="code-banner error" role="alert" data-testid="save-error">
            <Icon name="warn" size={15} />
            <span>
              <strong>Could not save:</strong> {save.error} Retrying…
            </span>
            <button type="button" className="code-banner-button" onClick={() => void saver.current?.flush()}>
              Retry now
            </button>
            {closeBlocked && (
              <button type="button" className="code-banner-button" onClick={closeCode}>
                Close without saving
              </button>
            )}
          </div>
        )}
        <div className="code-body">
          {load.status === 'loading' && (
            <div className="code-state">
              <div className="spinner" aria-hidden="true" /> Loading {name}…
            </div>
          )}
          {load.status === 'error' && (
            <div className="code-state error" role="alert">
              <Icon name="warn" size={20} />
              <strong>Source not available</strong>
              <span>{load.message}</span>
            </div>
          )}
          <div ref={host} className="code-editor" hidden={load.status !== 'ready'} />
        </div>
        <footer className="code-status">
          <SaveStatusItem writable={writable} editing={editing} save={save} />
          <span className="code-status-item">{LANGUAGE_NAMES[language]}</span>
          {lines > 0 && <span className="code-status-item">{lines} lines</span>}
          {node.line && (
            <span className="code-status-item" title="Where this node is declared">
              {node.endLine && node.endLine > node.line ? `Declared on ${node.line}–${node.endLine}` : `Declared on line ${node.line}`}
            </span>
          )}
          <span className="code-status-spacer" />
          {cursor && <span className="code-status-item">Ln {cursor.line}, Col {cursor.col}</span>}
          <span className="code-status-item">{lineBreak.current === '\r\n' ? 'CRLF' : 'LF'}</span>
          <span className="code-status-item">UTF-8</span>
        </footer>
      </div>
    </div>
  )
}

/** Opens the assistant with this file (and the selection) attached. */
function AskClaude() {
  const available = useAssistant((s) => s.available)
  if (!available) return null
  return (
    <button type="button" className="code-button ask-claude" onClick={() => useAssistant.getState().setOpen(true)} title="Ask Claude about this file or the selection  (⌘J)" aria-label="Ask Claude" data-testid="ask-claude">
      <Icon name="sparkle" size={15} />
    </button>
  )
}

function SaveStatusItem({ writable, editing, save }: { writable: boolean; editing: boolean; save: AutosaveState }) {
  if (!writable) {
    return (
      <span className="code-status-item" title="Editing works when repomap serves your own repository on localhost (npm start)" data-testid="save-status">
        <Icon name="lock" size={12} /> Read-only
      </span>
    )
  }
  const savedAt = save.savedAt ? `Saved at ${new Date(save.savedAt).toLocaleTimeString()}` : 'Changes are saved automatically'
  const content: Record<AutosaveState['status'], [string, string]> = {
    saved: [save.savedAt ? 'Saved' : editing ? 'Autosave on' : 'Read-only view', savedAt],
    pending: ['Unsaved changes', 'Saving in a moment (⌘S saves now)'],
    saving: ['Saving…', savedAt],
    error: ['Not saved', save.error ?? ''],
    conflict: ['Changed on disk', save.error ?? ''],
  }
  const [label, title] = content[save.status]
  return (
    <span className={`code-status-item save-${save.status}`} title={title} data-testid="save-status" data-status={save.status}>
      <Icon name={save.status === 'error' || save.status === 'conflict' ? 'warn' : save.status === 'saved' && save.savedAt ? 'check' : 'edit'} size={12} /> {label}
    </span>
  )
}
