/** VS Code "Dark+" / "Light+" look for CodeMirror: editor chrome and token colours. */
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

interface Palette {
  background: string
  foreground: string
  gutter: string
  lineNumber: string
  activeLineNumber: string
  activeLine: string
  selection: string
  cursor: string
  match: string
  comment: string
  keyword: string
  control: string
  string: string
  regexp: string
  number: string
  type: string
  func: string
  variable: string
  constant: string
  tag: string
  attribute: string
  punctuation: string
  heading: string
  invalid: string
  target: string
  targetEdge: string
}

// VS Code Dark+/Light+ colours, a few nudged just enough to reach WCAG AA (4.5:1) on highlighted lines.
const DARK: Palette = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  gutter: '#1e1e1e',
  lineNumber: '#9d9d9d',
  activeLineNumber: '#c6c6c6',
  activeLine: 'rgba(255, 255, 255, 0.045)',
  selection: '#264f78',
  cursor: '#aeafad',
  match: 'rgba(234, 92, 0, 0.33)',
  comment: '#80a86f',
  keyword: '#62a3d9',
  control: '#c688c1',
  string: '#ce9178',
  regexp: '#da8686',
  number: '#b5cea8',
  type: '#4ec9b0',
  func: '#dcdcaa',
  variable: '#9cdcfe',
  constant: '#4fc1ff',
  tag: '#62a3d9',
  attribute: '#9cdcfe',
  punctuation: '#d4d4d4',
  heading: '#569cd6',
  invalid: '#f77575',
  target: 'rgba(56, 189, 248, 0.09)',
  targetEdge: '#38bdf8',
}

const LIGHT: Palette = {
  background: '#ffffff',
  foreground: '#000000',
  gutter: '#ffffff',
  lineNumber: '#21718a',
  activeLineNumber: '#0b216f',
  activeLine: 'rgba(0, 0, 0, 0.035)',
  selection: '#add6ff',
  cursor: '#000000',
  match: 'rgba(234, 92, 0, 0.25)',
  comment: '#007a00',
  keyword: '#0000ff',
  control: '#ad00d9',
  string: '#a31515',
  regexp: '#811f3f',
  number: '#08774e',
  type: '#227188',
  func: '#795e26',
  variable: '#001080',
  constant: '#006ab7',
  tag: '#800000',
  attribute: '#d30000',
  punctuation: '#000000',
  heading: '#800000',
  invalid: '#c32f2f',
  target: 'rgba(2, 132, 199, 0.08)',
  targetEdge: '#0284c7',
}

export function vscodeTheme(dark: boolean): Extension {
  const c = dark ? DARK : LIGHT
  const chrome = EditorView.theme(
    {
      '&': { color: c.foreground, backgroundColor: c.background, height: '100%' },
      '.cm-scroller': {
        fontFamily: "Menlo, Monaco, 'SF Mono', Consolas, 'Liberation Mono', 'Courier New', monospace",
        fontSize: '13px',
        lineHeight: '20px',
      },
      '.cm-content': { caretColor: c.cursor, padding: '8px 0 24px' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: c.cursor },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: c.selection },
      '.cm-gutters': { backgroundColor: c.gutter, color: c.lineNumber, border: 'none', paddingRight: '6px' },
      '.cm-lineNumbers .cm-gutterElement': { minWidth: '38px', padding: '0 10px 0 12px' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: c.activeLineNumber },
      '.cm-activeLine': { backgroundColor: c.activeLine },
      '.cm-searchMatch': { backgroundColor: c.match, outline: 'none' },
      '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: dark ? 'rgba(81, 92, 106, 0.9)' : 'rgba(166, 185, 200, 0.9)' },
      '.cm-selectionMatch': { backgroundColor: dark ? 'rgba(173, 214, 255, 0.15)' : 'rgba(173, 214, 255, 0.5)' },
      '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: dark ? 'rgba(0, 100, 0, 0.35)' : 'rgba(0, 100, 0, 0.12)', outline: '1px solid #888' },
      '.cm-foldPlaceholder': { backgroundColor: dark ? '#3a3d41' : '#e5e5e5', border: 'none', color: c.lineNumber },
      '.cm-foldGutter .cm-gutterElement': { color: c.lineNumber, cursor: 'pointer' },
      '.cm-target-line': { backgroundColor: c.target },
      '.cm-target-start': { backgroundColor: c.target, boxShadow: `inset 3px 0 0 ${c.targetEdge}` },
      '.cm-target-gutter': { color: c.targetEdge, fontWeight: '700' },
      '.cm-panels': { backgroundColor: dark ? '#252526' : '#f3f3f3', color: c.foreground },
      '.cm-panels.cm-panels-top': { borderBottom: `1px solid ${dark ? '#3c3c3c' : '#e5e5e5'}` },
      '.cm-panel.cm-search': { padding: '6px 10px', fontFamily: 'inherit' },
      '.cm-panel.cm-search input, .cm-panel.cm-search button': { fontSize: '12px' },
      '.cm-textfield': {
        backgroundColor: dark ? '#3c3c3c' : '#ffffff',
        color: c.foreground,
        border: `1px solid ${dark ? '#3c3c3c' : '#cecece'}`,
        borderRadius: '3px',
      },
      '.cm-button': {
        backgroundImage: 'none',
        backgroundColor: dark ? '#3a3d41' : '#e5e5e5',
        color: c.foreground,
        border: 'none',
        borderRadius: '3px',
      },
      '.cm-tooltip': { backgroundColor: dark ? '#252526' : '#f3f3f3', border: `1px solid ${dark ? '#454545' : '#c8c8c8'}` },
    },
    { dark },
  )
  const highlight = HighlightStyle.define([
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: c.comment },
    { tag: [t.controlKeyword, t.moduleKeyword], color: c.control },
    { tag: [t.keyword, t.definitionKeyword, t.modifier, t.operatorKeyword, t.self, t.null, t.bool, t.atom], color: c.keyword },
    { tag: [t.string, t.special(t.string), t.character, t.docString, t.attributeValue], color: c.string },
    { tag: [t.regexp, t.escape], color: c.regexp },
    { tag: [t.number, t.integer, t.float], color: c.number },
    { tag: [t.typeName, t.className, t.namespace, t.standard(t.typeName), t.annotation], color: c.type },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName)), t.macroName], color: c.func },
    { tag: [t.variableName, t.definition(t.variableName), t.propertyName, t.definition(t.propertyName), t.labelName, t.special(t.variableName)], color: c.variable },
    { tag: [t.constant(t.variableName), t.constant(t.propertyName), t.standard(t.variableName)], color: c.constant },
    { tag: [t.tagName, t.angleBracket], color: c.tag },
    { tag: t.attributeName, color: c.attribute },
    { tag: [t.operator, t.punctuation, t.separator, t.bracket, t.derefOperator], color: c.punctuation },
    { tag: [t.heading, t.heading1, t.heading2, t.heading3], color: c.heading, fontWeight: 'bold' },
    { tag: t.link, color: c.string, textDecoration: 'underline' },
    { tag: t.url, color: c.string },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
    { tag: t.meta, color: dark ? '#9b9b9b' : '#6f6f6f' },
    { tag: t.invalid, color: c.invalid },
  ])
  return [chrome, syntaxHighlighting(highlight)]
}
