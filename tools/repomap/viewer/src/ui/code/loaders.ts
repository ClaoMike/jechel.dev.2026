/**
 * Language support for the code panel, loaded on demand (each grammar is its own small chunk, so the
 * main bundle doesn't grow).
 */
import { StreamLanguage, type StreamParser } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import type { LanguageId } from './languages.ts'

export async function loadLanguage(id: LanguageId): Promise<Extension | null> {
  switch (id) {
    case 'tsx':
    case 'ts':
    case 'jsx':
    case 'js': {
      const { javascript } = await import('@codemirror/lang-javascript')
      return javascript({ typescript: id === 'tsx' || id === 'ts', jsx: id === 'tsx' || id === 'jsx' })
    }
    case 'csharp': {
      const { csharp } = await import('@codemirror/legacy-modes/mode/clike')
      return StreamLanguage.define(withIdeTokens(csharp))
    }
    case 'json':
      return (await import('@codemirror/lang-json')).json()
    case 'xml':
      return (await import('@codemirror/lang-xml')).xml()
    case 'css':
      return (await import('@codemirror/lang-css')).css()
    case 'html':
      return (await import('@codemirror/lang-html')).html()
    case 'python':
      return (await import('@codemirror/lang-python')).python()
    case 'yaml':
      return (await import('@codemirror/lang-yaml')).yaml()
    case 'markdown':
      return (await import('@codemirror/lang-markdown')).markdown()
    case 'sql':
      return (await import('@codemirror/lang-sql')).sql()
    case 'shell':
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/shell')).shell)
    case 'powershell':
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/powershell')).powerShell)
    case 'http':
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/http')).http)
    case 'dockerfile':
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/dockerfile')).dockerFile)
    case 'toml':
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/toml')).toml)
    default:
      return null
  }
}

/**
 * The legacy C# mode only knows keywords and built-in types. Make it read like an IDE:
 * `Name(` / `Name<T>(` → function, `.Name` → property, other PascalCase words → type.
 */
function withIdeTokens<State>(base: StreamParser<State>): StreamParser<State> {
  return {
    ...base,
    token(stream, state) {
      const style = base.token(stream, state)
      if (style !== 'variable' && style !== 'def' && style !== null) return style
      const word = stream.current()
      if (!/^@?[A-Za-z_]\w*$/.test(word)) return style
      if (stream.match(/^\s*(<[\w\s,.?<>[\]]*>)?\s*\(/, false)) return 'variableName.function'
      const before = stream.string.slice(0, stream.start).trimEnd()
      if (before.endsWith('.')) return 'propertyName'
      if (/^[A-Z]/.test(word)) return 'typeName'
      return style
    },
  }
}
