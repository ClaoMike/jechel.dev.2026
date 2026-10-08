/**
 * The file universe: tracked + untracked-but-not-ignored files from git (so build output never shows
 * up), minus config excludes. Each file gets a layer and a role from the ordered config rules.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'
import picomatch from 'picomatch'
import type { FileEntry } from '../shared/types.ts'
import type { LayerRule, RepoMapConfig, RoleRule } from './config.ts'

export function listRepoFiles(repoRoot: string): string[] {
  try {
    const output = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const files = output.split('\0').filter(Boolean)
    // Deleted-but-not-committed files are still listed by --cached; keep only existing ones.
    return [...new Set(files)].filter((file) => isFile(join(repoRoot, file))).sort()
  } catch {
    return walk(repoRoot).sort()
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/** Fallback when the folder is not a git repository. */
function walk(root: string, dir = ''): string[] {
  const skip = new Set(['.git', 'node_modules', 'bin', 'obj', 'dist', '.out', 'coverage'])
  const result: string[] = []
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (skip.has(entry.name)) continue
    const rel = dir ? `${dir}/${entry.name}` : entry.name
    if (entry.isDirectory()) result.push(...walk(root, rel))
    else if (entry.isFile()) result.push(rel)
  }
  return result
}

export function matcher(globs: string[] | undefined): (path: string) => boolean {
  if (!globs || globs.length === 0) return () => false
  const isMatch = picomatch(globs, { dot: true })
  return (path) => isMatch(path)
}

/** Applies excludes, then assigns every file a layer and a role. */
export function classifyFiles(allFiles: string[], config: RepoMapConfig): FileEntry[] {
  const excluded = matcher(config.exclude)
  const files = allFiles.filter((file) => !excluded(file))
  const layerOf = createLayerResolver(files, config.layerRules, config.repoRoot, config.defaultLayer)
  const roleOf = createRoleResolver(config.roleRules, config.defaultRole)
  return files.map((path) => {
    const layer = layerOf(path)
    const role = roleOf(path)
    return { path, layer: layer.layer, role: role.role, roleReason: role.reason }
  })
}

export function createRoleResolver(rules: RoleRule[], defaultRole: string) {
  const compiled = rules.map((rule) => ({ rule, isMatch: matcher(rule.match) }))
  return (path: string): { role: string; reason: string } => {
    for (const { rule, isMatch } of compiled) {
      if (isMatch(path)) return { role: rule.role, reason: rule.reason ?? `matches ${rule.match.join(', ')}` }
    }
    return { role: defaultRole, reason: 'no test, config, generated or tooling rule matched' }
  }
}

export function createLayerResolver(files: string[], rules: LayerRule[], repoRoot: string, defaultLayer: string) {
  const compiled = rules.map((rule) => {
    if (rule.marker) {
      const isMarker = picomatch(rule.marker, { dot: true, basename: true })
      const dirs = files
        .filter((file) => isMarker(posix.basename(file)))
        .filter((file) => {
          if (!rule.contains) return true
          try {
            return readFileSync(join(repoRoot, file), 'utf8').includes(rule.contains)
          } catch {
            return false
          }
        })
        .map((file) => posix.dirname(file))
      const isInside = (path: string) => dirs.some((dir) => dir === '.' || path.startsWith(`${dir}/`))
      return { rule, test: isInside }
    }
    return { rule, test: matcher(rule.match) }
  })
  return (path: string): { layer: string; reason: string } => {
    for (const { rule, test } of compiled) {
      if (test(path)) return { layer: rule.layer, reason: rule.reason ?? 'layer rule' }
    }
    return { layer: defaultLayer, reason: 'default layer' }
  }
}
