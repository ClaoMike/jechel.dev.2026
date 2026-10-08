/**
 * Generic extractor: one node per file that no other plugin claimed (config, docs, scripts, CI…).
 * Stack-agnostic, so it works on any repository. A few cheap content sniffers add useful links:
 * .csproj project references, .http request files, localhost URLs in scripts, <script src> in HTML.
 */
import { readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import picomatch from 'picomatch'
import { log, runPlugin } from '../../src/plugin-kit.ts'
import { fileNodeId } from '../../src/shared/types.ts'
import type { Fact, FileEntry, PluginEdge, PluginNode, PluginOutput } from '../../src/shared/types.ts'

const DEFAULT_KIND_RULES: [string[], string][] = [
  [['.github/workflows/*.{yml,yaml}', '**/.gitlab-ci.yml', '**/azure-pipelines.yml'], 'workflow'],
  [['**/*.csproj', '**/*.fsproj', '**/*.vbproj', '**/package.json', '**/*.sln', '**/*.slnx'], 'project'],
  [['**/*.http', '**/*.rest'], 'http-file'],
  [['**/*.{css,scss,sass,less,styl}'], 'stylesheet'],
  [['**/*.d.ts'], 'type'],
  [['**/*.html', '**/*.htm'], 'html'],
  [['**/*.{md,mdx,txt,rst,adoc}', '**/LICENSE*'], 'doc'],
  [['**/*.{py,sh,bash,zsh,ps1,rb,pl}', '**/Makefile'], 'script'],
  [
    ['**/*.{json,jsonc,yml,yaml,toml,ini,xml,props,targets,config,env}', '**/Dockerfile*', '**/.env*', '**/*.config.*', '**/.*rc', '**/.*rc.*'],
    'config-file',
  ],
]

const MAX_READ = 512 * 1024

await runPlugin((request): PluginOutput => {
  const options = request.plugin.options as { kindRules?: [string[], string][] }
  const rules = [...(options.kindRules ?? []), ...DEFAULT_KIND_RULES].map(([globs, kind]) => ({
    kind,
    isMatch: picomatch(globs, { dot: true }),
  }))
  const claimed = new Set(request.claimed)
  const files = request.files.filter((f) => !claimed.has(f.path))
  const byPath = new Map(request.files.map((f) => [f.path, f]))
  const labels = uniqueLabels(files.map((f) => f.path))

  const nodes: PluginNode[] = []
  const edges: PluginEdge[] = []
  const facts: Fact[] = []

  for (const file of files) {
    const kind = rules.find((r) => r.isMatch(file.path))?.kind ?? 'file'
    const id = fileNodeId(file.layer, file.path)
    const node: PluginNode = { id, label: labels.get(file.path)!, kind, file: file.path, attrs: {} }
    const text = kind === 'file' ? undefined : read(request.repoRoot, file.path)
    if (text !== undefined) sniff({ file, kind, text, node, id, byPath, edges, facts })
    if (node.attrs && Object.keys(node.attrs).length === 0) delete node.attrs
    nodes.push(node)
  }
  log(`files: ${nodes.length} file nodes (${request.claimed.length} files claimed by other plugins)`)
  return { protocol: 1, nodes, edges, facts }
})

function read(repoRoot: string, path: string): string | undefined {
  try {
    const buffer = readFileSync(join(repoRoot, path))
    if (buffer.length > MAX_READ || buffer.includes(0)) return undefined
    return buffer.toString('utf8')
  } catch {
    return undefined
  }
}

/** Basename, or parent/basename when two files share a name (package.json, appsettings.json…). */
function uniqueLabels(paths: string[]): Map<string, string> {
  const counts = new Map<string, number>()
  for (const path of paths) counts.set(posix.basename(path), (counts.get(posix.basename(path)) ?? 0) + 1)
  return new Map(
    paths.map((path) => {
      const base = posix.basename(path)
      const parent = posix.basename(posix.dirname(path))
      return [path, counts.get(base)! > 1 && parent !== '.' ? `${parent}/${base}` : base]
    }),
  )
}

interface SniffContext {
  file: FileEntry
  kind: string
  text: string
  node: PluginNode
  id: string
  byPath: Map<string, FileEntry>
  edges: PluginEdge[]
  facts: Fact[]
}

function sniff(ctx: SniffContext): void {
  const { file, kind, text, node } = ctx
  const attrs = node.attrs as Record<string, unknown>
  const lines = text.split(/\r?\n/)
  const lineOf = (index: number) => text.slice(0, index).split('\n').length

  if (file.path.endsWith('.csproj') || file.path.endsWith('.fsproj')) {
    const packages = [...text.matchAll(/<PackageReference\s+Include="([^"]+)"(?:\s+Version="([^"]+)")?/g)].map((m) =>
      m[2] ? `${m[1]} ${m[2]}` : m[1],
    )
    if (packages.length) attrs.packages = packages
    const framework = /<TargetFrameworks?>([^<]+)</.exec(text)?.[1]
    if (framework) attrs.targetFramework = framework
    if (/Microsoft\.NET\.Test\.Sdk|<IsTestProject>\s*true/i.test(text)) attrs.testProject = true
    for (const match of text.matchAll(/<ProjectReference\s+Include="([^"]+)"/g)) {
      const target = posix.normalize(posix.join(posix.dirname(file.path), match[1].replace(/\\/g, '/')))
      const entry = ctx.byPath.get(target)
      if (entry) {
        ctx.edges.push({ from: ctx.id, to: fileNodeId(entry.layer, entry.path), type: 'depends-on', evidence: [{ file: file.path, line: lineOf(match.index!) }] })
      }
    }
    return
  }

  if (posix.basename(file.path) === 'package.json') {
    try {
      const pkg = JSON.parse(text) as { name?: string; scripts?: Record<string, string>; dependencies?: object; devDependencies?: object }
      if (pkg.name) attrs.name = pkg.name
      if (pkg.scripts) attrs.scripts = Object.keys(pkg.scripts)
      attrs.dependencies = Object.keys(pkg.dependencies ?? {})
      attrs.devDependencies = Object.keys(pkg.devDependencies ?? {}).length
    } catch {
      // not valid JSON; leave it as a plain file
    }
    return
  }

  if (/appsettings.*\.json$/i.test(file.path)) {
    try {
      attrs.sections = Object.keys(JSON.parse(text) as object)
    } catch {
      // ignore
    }
    return
  }

  if (kind === 'workflow') {
    const name = /^name:\s*(.+)$/m.exec(text)?.[1]?.trim()
    if (name) attrs.name = name.replace(/^['"]|['"]$/g, '')
    const jobsIndex = lines.findIndex((l) => /^jobs:\s*$/.test(l))
    if (jobsIndex >= 0) {
      attrs.jobs = lines
        .slice(jobsIndex + 1)
        .map((l) => /^ {2}([\w-]+):\s*$/.exec(l)?.[1])
        .filter(Boolean)
    }
    return
  }

  if (/docker-compose|compose\.ya?ml$/.test(file.path)) {
    const servicesIndex = lines.findIndex((l) => /^services:\s*$/.test(l))
    if (servicesIndex >= 0) {
      const services: string[] = []
      for (const line of lines.slice(servicesIndex + 1)) {
        if (/^\S/.test(line)) break
        const service = /^ {2}([\w.-]+):\s*$/.exec(line)?.[1]
        if (service) services.push(service)
      }
      attrs.services = services
    }
    const images = [...text.matchAll(/^\s*image:\s*(\S+)/gm)].map((m) => m[1])
    if (images.length) attrs.images = images
    return
  }

  if (kind === 'http-file') {
    text.split('\n').forEach((line, index) => {
      const match = /^\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)/.exec(line)
      if (match) {
        ctx.facts.push({ type: 'http', from: ctx.id, edgeType: 'http', method: match[1], url: match[2], evidence: [{ file: file.path, line: index + 1 }] })
      }
    })
    return
  }

  if (kind === 'script' || kind === 'workflow') {
    for (const match of text.matchAll(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/[^\s'"`)<>]*)/g)) {
      ctx.facts.push({
        type: 'http',
        from: ctx.id,
        edgeType: 'http',
        url: match[1],
        confidence: 0.8,
        evidence: [{ file: file.path, line: lineOf(match.index!) }],
      })
    }
    return
  }

  if (kind === 'html') {
    const title = /<title>([^<]*)<\/title>/i.exec(text)?.[1]
    if (title) attrs.title = title.trim()
    for (const match of text.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/gi)) {
      const ref = match[1]
      if (/^(https?:)?\/\//.test(ref)) continue
      // Vite resolves "/src/main.tsx" relative to the folder of index.html (the Vite root).
      const target = posix.normalize(posix.join(posix.dirname(file.path), ref))
      if (ctx.byPath.has(target)) {
        ctx.facts.push({ type: 'file-ref', from: ctx.id, edgeType: 'uses', path: target, evidence: [{ file: file.path, line: lineOf(match.index!) }] })
      }
    }
    return
  }

  if (kind === 'doc') {
    const title = /^#\s+(.+)$/m.exec(text)?.[1]
    if (title) attrs.title = title.trim()
  }
}
