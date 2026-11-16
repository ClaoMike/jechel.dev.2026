/**
 * New projects from a template (templates/<id>): a copy of the standard structure — a React + TypeScript frontend in
 * Feature-Sliced Design, an ASP.NET Core API in vertical slices, PostgreSQL, all run by docker compose — with its
 * names and ports filled in, and the lint rules and architecture tests that keep that structure.
 *
 * Placeholders, in file contents and in paths: __NAME__ (as written), __SLUG__ (my-shop), __NAMESPACE__ (MyShop),
 * __DB__ (my_shop), __WEB_PORT__, __API_PORT__, __DB_PORT__.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import { TOOL_ROOT } from './config.ts'

export const DEFAULT_TEMPLATE = 'react-aspnet-postgres'

export interface ProjectNames {
  name: string
  slug: string
  namespace: string
  db: string
}

export interface ProjectPorts {
  web: number
  api: number
  db: number
}

export class ScaffoldError extends Error {
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

/** The names a project goes by: "My Shop" → my-shop (folder, containers, packages), MyShop (C#), my_shop (database). */
export function projectNames(name: string): ProjectNames {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  const words = trimmed.split(/[^A-Za-z0-9]+/).filter(Boolean)
  if (!trimmed || trimmed.length > 60 || words.length === 0) throw new ScaffoldError('Give the project a name (letters and digits, up to 60 characters).')
  if (!/^[A-Za-z]/.test(words[0])) throw new ScaffoldError('The name must start with a letter.')
  if (/[<>"`$\\]/.test(trimmed)) throw new ScaffoldError('The name can only have letters, digits, spaces and simple punctuation.')
  const split = words.flatMap((w) => w.split(/(?<=[a-z0-9])(?=[A-Z])/))
  const slug = split.map((w) => w.toLowerCase()).join('-')
  const namespace = split.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
  return { name: trimmed, slug, namespace, db: slug.replace(/-/g, '_') }
}

const TEXT = /\.(cs|csproj|slnx|json|ts|tsx|css|html|md|yml|yaml|conf|txt)$|(^|\/)(Dockerfile|\.gitignore|\.dockerignore|\.oxlintrc\.json)$/

function fill(text: string, names: ProjectNames, ports: ProjectPorts): string {
  return text
    .replaceAll('__NAMESPACE__', names.namespace)
    .replaceAll('__SLUG__', names.slug)
    .replaceAll('__NAME__', names.name)
    .replaceAll('__DB_PORT__', String(ports.db))
    .replaceAll('__DB__', names.db)
    .replaceAll('__WEB_PORT__', String(ports.web))
    .replaceAll('__API_PORT__', String(ports.api))
}

/** Whether nothing on this machine listens on the port. */
function portFree(port: number): Promise<boolean> {
  return new Promise((resolveFree) => {
    const server = createServer()
    server.once('error', () => resolveFree(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolveFree(true)))
  })
}

/** Ports for a new project: free now, and not given to another project already. */
export async function choosePorts(taken: ProjectPorts[]): Promise<ProjectPorts> {
  const pick = async (from: number, used: number[]) => {
    for (let port = from; port < from + 200; port++) if (!used.includes(port) && (await portFree(port))) return port
    throw new ScaffoldError('No free port found for the project.', 500)
  }
  return {
    web: await pick(
      8081,
      taken.map((p) => p.web),
    ),
    api: await pick(
      5201,
      taken.map((p) => p.api),
    ),
    db: await pick(
      5441,
      taken.map((p) => p.db),
    ),
  }
}

export interface ScaffoldResult {
  root: string
  names: ProjectNames
  ports: ProjectPorts
  files: number
}

/** Creates the project in <parent>/<slug> from the template, as a new git repository (its files staged, not committed). */
export function scaffoldProject(options: { name: string; parent: string; ports: ProjectPorts; template?: string; git?: boolean }): ScaffoldResult {
  const names = projectNames(options.name)
  const parent = resolve(options.parent)
  if (!existsSync(parent) || !statSync(parent).isDirectory()) throw new ScaffoldError(`There is no folder ${parent}.`)
  const root = join(parent, names.slug)
  if (existsSync(root) && readdirSync(root).length > 0) throw new ScaffoldError(`${root} already exists and isn't empty.`, 409)
  const template = join(TOOL_ROOT, 'templates', options.template ?? DEFAULT_TEMPLATE)
  if (!existsSync(template)) throw new ScaffoldError(`No template "${options.template}".`, 404)

  let files = 0
  const copy = (from: string, to: string, rel: string) => {
    mkdirSync(to, { recursive: true })
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      const source = join(from, entry.name)
      const target = join(to, fill(entry.name, names, options.ports))
      const path = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) copy(source, target, path)
      else if (TEXT.test(path)) {
        writeFileSync(target, fill(readFileSync(source, 'utf8'), names, options.ports))
        files++
      } else {
        copyFileSync(source, target)
        files++
      }
    }
  }
  copy(template, root, '')

  if (options.git !== false) {
    // A repository of its own, with everything staged: the map lists it, and the first commit is yours to make.
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
    execFileSync('git', ['add', '-A'], { cwd: root })
  }
  return { root, names, ports: options.ports, files }
}
