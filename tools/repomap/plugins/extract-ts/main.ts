/**
 * TypeScript / React extractor (ts-morph).
 *
 * Groups files by project (nearest folder with a tsconfig.json or package.json), loads each project's
 * compiler options (paths, jsx…) and hands it to the analysis in extract.ts.
 */
import { existsSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { Project, ts } from 'ts-morph'
import { log, runPlugin } from '../../src/plugin-kit.ts'
import type { Diagnostic, Fact, FileEntry, PluginEdge, PluginNode } from '../../src/shared/types.ts'
import { extractProject } from './extract.ts'

const SOURCE = /\.(tsx?|mts|cts|jsx?|mjs|cjs)$/

await runPlugin((request) => {
  const apiPrefixes = (request.plugin.options.apiPrefixes as string[] | undefined) ?? ['/api']
  const files = request.files.filter((f) => SOURCE.test(f.path) && !f.path.endsWith('.d.ts') && f.role !== 'config')

  const nodes: PluginNode[] = []
  const edges: PluginEdge[] = []
  const facts: Fact[] = []
  const claims: string[] = []
  const diagnostics: Diagnostic[] = []

  for (const [root, group] of groupByProject(request.repoRoot, files)) {
    const started = performance.now()
    const project = new Project({
      compilerOptions: compilerOptionsFor(join(request.repoRoot, root)),
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
      skipLoadingLibFiles: true,
    })
    for (const file of group) project.addSourceFileAtPath(join(request.repoRoot, file.path))
    const result = extractProject(project, group, request.repoRoot, { apiPrefixes })
    nodes.push(...result.nodes)
    edges.push(...result.edges)
    facts.push(...result.facts)
    claims.push(...result.claims)
    diagnostics.push(...result.diagnostics)
    log(`typescript: ${root || '.'}: ${group.length} files → ${result.nodes.length} nodes in ${Math.round(performance.now() - started)} ms`)
  }
  return { protocol: 1, nodes, edges, facts, claims, diagnostics }
})

/** Nearest folder (walking up) that has a tsconfig/jsconfig/package.json. */
function groupByProject(repoRoot: string, files: FileEntry[]): Map<string, FileEntry[]> {
  const cache = new Map<string, string>()
  const rootOf = (dir: string): string => {
    const cached = cache.get(dir)
    if (cached !== undefined) return cached
    let root = dir
    if (!['tsconfig.json', 'jsconfig.json', 'package.json'].some((name) => existsSync(join(repoRoot, dir, name)))) {
      root = dir === '.' || dir === '' ? '' : rootOf(posix.dirname(dir) === '.' ? '' : posix.dirname(dir))
    }
    cache.set(dir, root)
    return root
  }
  const groups = new Map<string, FileEntry[]>()
  for (const file of files) {
    const root = rootOf(posix.dirname(file.path))
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(file)
  }
  return groups
}

function compilerOptionsFor(projectDir: string): ts.CompilerOptions {
  let options: ts.CompilerOptions = {}
  for (const name of ['tsconfig.app.json', 'tsconfig.json', 'jsconfig.json']) {
    const path = join(projectDir, name)
    if (!existsSync(path)) continue
    const read = ts.readConfigFile(path, ts.sys.readFile)
    if (read.error) continue
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(path))
    options = parsed.options
    break
  }
  return {
    ...options,
    noEmit: true,
    allowJs: true,
    checkJs: false,
    skipLibCheck: true,
    // Only the files we add are analysed; imports of packages stay unresolved (fast, and not needed).
    noResolve: true,
    types: [],
    allowImportingTsExtensions: true,
    jsx: options.jsx ?? ts.JsxEmit.ReactJSX,
    module: options.module ?? ts.ModuleKind.ESNext,
    moduleResolution: options.moduleResolution ?? ts.ModuleResolutionKind.Bundler,
    target: options.target ?? ts.ScriptTarget.ES2022,
  }
}
