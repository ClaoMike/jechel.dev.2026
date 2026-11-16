/**
 * The projects repomap knows (the Projects menu): repositories on this machine, each mapped with its own config. Kept in
 * ~/.config/repomap/projects.json (REPOMAP_PROJECTS overrides it), beside the assistant's settings.
 *
 * A project's config is its own repomap.config.json when it has one (projects created here do), or a default one that
 * extends the stack preset. Its graph, history and chats live in repomap's own .out/projects/<id>/, never in the project;
 * the project repomap was started with keeps its config's output.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import type { ProjectInfo } from '../shared/projects.ts'
import { loadConfig, TOOL_ROOT, type RepoMapConfig } from './config.ts'
import type { ProjectPorts } from './scaffold.ts'

export interface ProjectEntry {
  id: string
  name: string
  /** Absolute path of the repository. */
  root: string
  /** Absolute path of its config, when it isn't <root>/repomap.config.json (the project repomap was started with). */
  config?: string
  /** The ports given to it when it was created (new projects get others). */
  ports?: ProjectPorts
  /** The project keeps its config's own output (the one repomap was started with). */
  ownOutput?: boolean
}

interface ProjectsFile {
  version: 1
  projects: ProjectEntry[]
}

export class ProjectError extends Error {
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export function defaultProjectsPath(): string {
  return process.env.REPOMAP_PROJECTS || join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'repomap', 'projects.json')
}

/** A stable id from the folder: its name and a short hash of the path (two "web" folders stay apart). */
export function projectId(root: string): string {
  const slug =
    basename(root)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'project'
  return `${slug}-${createHash('sha256').update(resolve(root)).digest('hex').slice(0, 6)}`
}

export class ProjectRegistry {
  readonly path: string

  constructor(path = defaultProjectsPath()) {
    this.path = path
  }

  list(): ProjectEntry[] {
    if (!existsSync(this.path)) return []
    try {
      const data = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<ProjectsFile>
      return Array.isArray(data.projects) ? data.projects.filter((p) => p && typeof p.root === 'string' && typeof p.id === 'string') : []
    } catch {
      return []
    }
  }

  get(id: string): ProjectEntry | undefined {
    return this.list().find((p) => p.id === id)
  }

  /** Adds the project (or updates the one at the same root) and returns it. */
  save(entry: Omit<ProjectEntry, 'id'> & { id?: string }): ProjectEntry {
    const root = resolve(entry.root)
    const projects = this.list()
    const existing = projects.find((p) => p.root === root)
    const saved: ProjectEntry = { ...existing, ...entry, root, id: existing?.id ?? entry.id ?? projectId(root) }
    const next = existing ? projects.map((p) => (p === existing ? saved : p)) : [...projects, saved]
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, `${JSON.stringify({ version: 1, projects: next } satisfies ProjectsFile, null, 2)}\n`)
    return saved
  }

  /** An existing repository, opened from the menu. */
  add(rootPath: string, name?: string): ProjectEntry {
    const root = resolve(rootPath)
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new ProjectError(`There is no folder ${root}.`, 404)
    if (!existsSync(join(root, '.git'))) throw new ProjectError(`${root} isn't a git repository (repomap maps the files git lists).`)
    return this.save({ root, name: name?.trim() || configuredName(root) || basename(root) })
  }

  /** The project repomap was started with: always listed, with its config as it is. */
  ensureStarted(config: RepoMapConfig): ProjectEntry {
    return this.save({ root: config.repoRoot, name: config.name, config: config.configPath, ownOutput: true })
  }

  info(entry: ProjectEntry, current: string | undefined): ProjectInfo {
    return {
      id: entry.id,
      name: entry.name,
      root: entry.root,
      current: entry.id === current,
      missing: !existsSync(entry.root),
    }
  }
}

/** The name a repository's own repomap.config.json gives it, if it has one that loads. */
function configuredName(root: string): string | undefined {
  const own = join(root, 'repomap.config.json')
  if (!existsSync(own)) return undefined
  try {
    return loadConfig(own).name
  } catch {
    return undefined
  }
}

/** The config a project is mapped with (see the file's comment). */
export function projectConfig(entry: ProjectEntry): RepoMapConfig {
  if (!existsSync(entry.root)) throw new ProjectError(`${entry.root} is gone.`, 404)
  const out = join(TOOL_ROOT, '.out', 'projects', entry.id)
  const own = entry.config ?? join(entry.root, 'repomap.config.json')
  if (existsSync(own)) return loadConfig(own, entry.ownOutput ? {} : { output: join(out, 'graph.json') })
  // No config of its own: the stack preset, written beside its graph.
  mkdirSync(out, { recursive: true })
  const generated = join(out, 'repomap.config.json')
  writeFileSync(generated, `${JSON.stringify({ extends: 'preset:react-aspnet-efcore-postgres', name: entry.name, repoRoot: entry.root, output: 'graph.json' }, null, 2)}\n`)
  return loadConfig(generated)
}
