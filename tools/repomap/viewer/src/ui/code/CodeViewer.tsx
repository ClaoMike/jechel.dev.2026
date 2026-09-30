/**
 * Read-only source view of a node's file, coloured like VS Code. Loaded lazily (the editor and each
 * language grammar are separate chunks).
 */
import { defaultKeymap } from '@codemirror/commands'
import { bracketMatching, codeFolding, foldGutter, foldKeymap } from '@codemirror/language'
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { EditorState, RangeSet, RangeSetBuilder, type Extension } from '@codemirror/state'
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
} from '@codemirror/view'
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { GraphNode } from '../../../../src/shared/types.ts'
import { fetchSource } from '../../model/source.ts'
import { useViewer } from '../../model/store.ts'
import { Icon, ShapeIcon } from '../icons.tsx'
import { LANGUAGE_NAMES, languageOf } from './languages.ts'
import { loadLanguage } from './loaders.ts'
import { vscodeTheme } from './theme.ts'

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; text: string; language: Extension | null }

export default function CodeViewer() {
  const codeView = useViewer((s) => s.codeView)
  const index = useViewer((s) => s.index)
  if (!codeView || !index) return null
  const node = index.nodes[codeView.node]
  if (!node) return null
  return <CodePanel key={node.id} node={node} />
}

class TargetMarker extends GutterMarker {
  elementClass = 'cm-target-gutter'
}
const targetMarker = new TargetMarker()

/** Highlights the node's declaration (line..endLine), the first line more strongly. */
function targetLines(doc: EditorState['doc'], line: number | undefined, endLine: number | undefined): Extension {
  if (!line || line > doc.lines) return []
  const last = Math.min(doc.lines, Math.max(line, endLine ?? line), line + 400)
  const decorations = new RangeSetBuilder<Decoration>()
  const gutter = new RangeSetBuilder<GutterMarker>()
  for (let n = line; n <= last; n++) {
    const from = doc.line(n).from
    decorations.add(from, from, Decoration.line({ class: n === line ? 'cm-target-start' : 'cm-target-line' }))
    gutter.add(from, from, targetMarker)
  }
  const set = decorations.finish()
  const markers: RangeSet<GutterMarker> = gutter.finish()
  return [EditorView.decorations.of(set), gutterLineClass.of(markers)]
}

function CodePanel({ node }: { node: GraphNode }) {
  const index = useViewer((s) => s.index)!
  const theme = useViewer((s) => s.theme)
  const close = useViewer((s) => s.closeCode)
  const file = node.file!
  const language = languageOf(file)
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [wrap, setWrap] = useState(() => window.matchMedia('(max-width: 820px)').matches)
  const [cursor, setCursor] = useState<{ line: number; col: number } | null>(null)
  const [lines, setLines] = useState(0)
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const scroll = useRef<number | null>(null)
  const kind = index.kinds.get(node.kind)
  const root = index.graph.meta.repo.root
  const editorHref = root ? `vscode://file/${encodeURI(`${root}/${file}`)}${node.line ? `:${node.line}` : ''}` : null

  // Remember what had focus, give it back when closing.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    return () => previous?.focus?.()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoad({ status: 'loading' })
    Promise.all([fetchSource(file, controller.signal), loadLanguage(language)])
      .then(([text, languageExtension]) => setLoad({ status: 'ready', text, language: languageExtension }))
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setLoad({ status: 'error', message: error.message })
      })
    return () => controller.abort()
  }, [file, language])

  useLayoutEffect(() => {
    if (load.status !== 'ready' || !host.current) return
    const doc = EditorState.create({ doc: load.text }).doc
    const target = node.line && node.line <= doc.lines ? node.line : undefined
    const state = EditorState.create({
      doc: load.text,
      selection: target ? { anchor: doc.line(target).from } : undefined,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        foldGutter(),
        codeFolding(),
        drawSelection(),
        highlightActiveLine(),
        bracketMatching(),
        highlightSelectionMatches(),
        search({ top: true }),
        EditorState.readOnly.of(true),
        // On touch screens a focusable editor would pop up the keyboard.
        EditorView.editable.of(!coarse),
        EditorState.tabSize.of(4),
        keymap.of([...searchKeymap, ...foldKeymap, ...defaultKeymap]),
        vscodeTheme(theme === 'dark'),
        wrap ? EditorView.lineWrapping : [],
        targetLines(doc, target, node.endLine),
        load.language ?? [],
        EditorView.contentAttributes.of({ 'aria-label': `Source of ${file}`, 'aria-readonly': 'true' }),
        EditorView.updateListener.of((update) => {
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head
            const line = update.state.doc.lineAt(head)
            setCursor({ line: line.number, col: head - line.from + 1 })
          }
        }),
      ],
    })
    const editor = new EditorView({ state, parent: host.current })
    view.current = editor
    setLines(state.doc.lines)
    if (target) setCursor({ line: target, col: 1 })
    if (scroll.current !== null) {
      editor.scrollDOM.scrollTop = scroll.current
    } else if (target) {
      editor.dispatch({ effects: EditorView.scrollIntoView(doc.line(target).from, { y: 'center' }) })
    }
    if (!coarse) editor.focus()
    return () => {
      scroll.current = editor.scrollDOM.scrollTop
      editor.destroy()
      view.current = null
    }
  }, [load, theme, wrap, node.line, node.endLine, file, coarse])

  const onKeyDown = (event: KeyboardEvent) => {
    // Escape first closes the editor's own search panel (which marks the event handled).
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.stopPropagation()
      close()
    }
  }

  const parts = file.split('/')
  const name = parts.pop()!
  return (
    <div className="code-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()} role="presentation">
      <div ref={dialog} className={`code-dialog code-${theme}`} role="dialog" aria-modal="true" aria-label={`Code of ${node.label}`} onKeyDown={onKeyDown} data-testid="code-viewer">
        <header className="code-header">
          <div className="code-title">
            {kind && <ShapeIcon shape={kind.shape} color={kind.color} size={16} />}
            <span className="code-node" title={node.id}>
              {node.label}
            </span>
            {kind && <span className="code-kind">{kind.label}</span>}
          </div>
          <div className="code-path" title={file}>
            <span className="code-dir">{parts.length > 0 ? `${parts.join('/')}/` : ''}</span>
            <strong>{name}</strong>
            {node.line ? <span className="code-dir">:{node.line}</span> : null}
          </div>
          <div className="code-actions">
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
            <button type="button" className="code-button" onClick={close} title="Close (Esc)" aria-label="Close code">
              <Icon name="close" size={16} />
            </button>
          </div>
        </header>
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
          <span className="code-status-item">
            <Icon name="lock" size={12} /> Read-only
          </span>
          <span className="code-status-item">{LANGUAGE_NAMES[language]}</span>
          {lines > 0 && <span className="code-status-item">{lines} lines</span>}
          {node.line && (
            <span className="code-status-item" title="Where this node is declared">
              {node.endLine && node.endLine > node.line ? `Declared on ${node.line}–${node.endLine}` : `Declared on line ${node.line}`}
            </span>
          )}
          <span className="code-status-spacer" />
          {cursor && <span className="code-status-item">Ln {cursor.line}, Col {cursor.col}</span>}
          <span className="code-status-item">UTF-8</span>
        </footer>
      </div>
    </div>
  )
}
