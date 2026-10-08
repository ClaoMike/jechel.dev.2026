/** File → language, for syntax highlighting in the code panel. Pure (no editor imports), so it's testable. */

export type LanguageId =
  | 'tsx'
  | 'ts'
  | 'jsx'
  | 'js'
  | 'csharp'
  | 'json'
  | 'xml'
  | 'css'
  | 'html'
  | 'python'
  | 'yaml'
  | 'markdown'
  | 'shell'
  | 'powershell'
  | 'http'
  | 'sql'
  | 'dockerfile'
  | 'toml'
  | 'text'

export const LANGUAGE_NAMES: Record<LanguageId, string> = {
  tsx: 'TypeScript JSX',
  ts: 'TypeScript',
  jsx: 'JavaScript JSX',
  js: 'JavaScript',
  csharp: 'C#',
  json: 'JSON',
  xml: 'XML',
  css: 'CSS',
  html: 'HTML',
  python: 'Python',
  yaml: 'YAML',
  markdown: 'Markdown',
  shell: 'Shell',
  powershell: 'PowerShell',
  http: 'HTTP',
  sql: 'SQL',
  dockerfile: 'Dockerfile',
  toml: 'TOML',
  text: 'Plain text',
}

const BY_EXTENSION: Record<string, LanguageId> = {
  tsx: 'tsx',
  ts: 'ts',
  mts: 'ts',
  cts: 'ts',
  jsx: 'jsx',
  js: 'js',
  mjs: 'js',
  cjs: 'js',
  cs: 'csharp',
  csx: 'csharp',
  json: 'json',
  jsonc: 'json',
  xml: 'xml',
  csproj: 'xml',
  fsproj: 'xml',
  vbproj: 'xml',
  props: 'xml',
  targets: 'xml',
  slnx: 'xml',
  config: 'xml',
  svg: 'xml',
  css: 'css',
  scss: 'css',
  less: 'css',
  html: 'html',
  htm: 'html',
  py: 'python',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  mdx: 'markdown',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ps1: 'powershell',
  http: 'http',
  rest: 'http',
  sql: 'sql',
  toml: 'toml',
}

export function languageOf(path: string): LanguageId {
  const name = path.split('/').pop() ?? path
  if (/^Dockerfile/i.test(name)) return 'dockerfile'
  if (/^\.?(env|editorconfig|gitignore|gitattributes)/i.test(name)) return 'shell'
  if (/^Makefile$/i.test(name)) return 'shell'
  const dot = name.lastIndexOf('.')
  if (dot <= 0 && !name.startsWith('.')) return 'text'
  const extension = name.slice(dot + 1).toLowerCase()
  if (name.toLowerCase().endsWith('.d.ts')) return 'ts'
  return BY_EXTENSION[extension] ?? 'text'
}
