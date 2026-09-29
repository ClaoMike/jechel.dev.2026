/**
 * Per-plugin output cache. A plugin is re-run only when its cache key changes:
 * plugin source + options + the exact list (and content) of the files it receives.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { PluginOutput } from '../shared/types.ts'

const SKIP_DIRS = new Set(['node_modules', 'bin', 'obj', 'dist', '.out'])

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Hash of every file under the given folders (plugin source, shared code). */
export function hashSources(root: string, folders: string[]): string {
  const hash = createHash('sha256')
  const visit = (dir: string) => {
    if (!existsSync(dir)) return
    const stat = statSync(dir)
    if (stat.isFile()) {
      hash.update(relative(root, dir)).update('\0').update(readFileSync(dir)).update('\0')
      return
    }
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP_DIRS.has(entry.name)) continue
      visit(join(dir, entry.name))
    }
  }
  for (const folder of folders) visit(join(root, folder))
  return hash.digest('hex')
}

/** Content hash of repo files (path + bytes). */
export function hashFiles(repoRoot: string, paths: string[]): string {
  const hash = createHash('sha256')
  for (const path of paths) {
    hash.update(path).update('\0')
    try {
      hash.update(readFileSync(join(repoRoot, path)))
    } catch {
      hash.update('<missing>')
    }
    hash.update('\0')
  }
  return hash.digest('hex')
}

export class PluginCache {
  private readonly dir: string
  constructor(outputDir: string) {
    this.dir = join(outputDir, 'cache')
  }

  private file(pluginId: string, key: string): string {
    return join(this.dir, `${pluginId}-${key.slice(0, 24)}.json`)
  }

  get(pluginId: string, key: string): PluginOutput | undefined {
    const path = this.file(pluginId, key)
    if (!existsSync(path)) return undefined
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as PluginOutput
    } catch {
      return undefined
    }
  }

  set(pluginId: string, key: string, output: PluginOutput): void {
    mkdirSync(this.dir, { recursive: true })
    // One entry per plugin: drop older keys.
    for (const name of readdirSync(this.dir)) {
      if (name.startsWith(`${pluginId}-`)) rmSync(join(this.dir, name), { force: true })
    }
    writeFileSync(this.file(pluginId, key), JSON.stringify(output))
  }
}
