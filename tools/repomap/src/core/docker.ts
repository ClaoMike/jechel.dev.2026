/**
 * Running a project with docker compose: Start (build and run), Stop (down, the data is kept) and Reload (rebuild and
 * recreate everything), and the services' state. One action at a time per project; its output is streamed to the
 * viewers (the `docker` server event). REPOMAP_DOCKER replaces the docker command (the tests use a fake one).
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { DockerAction, DockerEvent, DockerService, DockerStatus } from '../shared/projects.ts'
import type { DockerConfig } from './config.ts'

const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']
const KEEP_LINES = 400

export function dockerBinary(): string {
  return process.env.REPOMAP_DOCKER || 'docker'
}

/** The project's compose file (relative to its root), or undefined. */
export function composeFile(root: string, docker: DockerConfig): string | undefined {
  if (docker.file) return existsSync(join(root, docker.file)) ? docker.file : undefined
  return COMPOSE_FILES.find((name) => existsSync(join(root, name)))
}

/** The docker arguments of an action (or of `ps`, `config --services`). Pure. */
export function composeArgs(file: string, profiles: string[], command: DockerAction | 'ps' | 'services'): string[] {
  const base = ['compose', '-f', file, ...profiles.flatMap((p) => ['--profile', p])]
  switch (command) {
    case 'start':
      return [...base, '--progress', 'plain', 'up', '-d', '--build']
    case 'reload':
      return [...base, '--progress', 'plain', 'up', '-d', '--build', '--force-recreate']
    case 'stop':
      return [...base, '--progress', 'plain', 'down']
    case 'ps':
      return [...base, 'ps', '--all', '--format', 'json']
    case 'services':
      return [...base, 'config', '--services']
  }
}

/** `docker compose ps --format json`: one JSON object per line (newer compose) or one array (older). */
export function parsePs(text: string): DockerService[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const rows: Record<string, unknown>[] = trimmed.startsWith('[')
    ? JSON.parse(trimmed)
    : trimmed
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
  return rows.map((row) => ({
    name: String(row.Service ?? row.Name ?? ''),
    state: String(row.State ?? '').toLowerCase(),
    ...(row.Health ? { health: String(row.Health).toLowerCase() } : {}),
  }))
}

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g

function run(args: string[], cwd: string, onLine?: (line: string) => void): Promise<{ code: number; output: string }> {
  return new Promise((resolveRun) => {
    let output = ''
    let pending = ''
    const child = spawn(dockerBinary(), args, { cwd, env: process.env })
    const take = (chunk: Buffer) => {
      const text = chunk.toString('utf8').replace(ANSI, '')
      output += text
      if (!onLine) return
      pending += text
      const lines = pending.split(/\r?\n|\r/)
      pending = lines.pop() ?? ''
      for (const line of lines) if (line.trim()) onLine(line)
    }
    child.stdout.on('data', take)
    child.stderr.on('data', take)
    child.on('error', (error) => resolveRun({ code: -1, output: `${output}${error.message}` }))
    child.on('close', (code) => {
      if (onLine && pending.trim()) onLine(pending)
      resolveRun({ code: code ?? -1, output })
    })
  })
}

export class DockerError extends Error {
  readonly status: number
  constructor(message: string, status = 409) {
    super(message)
    this.status = status
  }
}

/** A project's Docker: its status, and the one action it may be running. */
export class DockerRunner {
  private busy?: DockerStatus['busy']
  private last?: DockerStatus['last']
  private readonly root: string
  private readonly docker: DockerConfig
  private readonly notify: (event: DockerEvent) => void

  constructor(root: string, docker: DockerConfig, notify: (event: DockerEvent) => void) {
    this.root = root
    this.docker = docker
    this.notify = notify
  }

  async status(): Promise<DockerStatus> {
    const file = composeFile(this.root, this.docker)
    const base = { busy: this.busy, last: this.last, url: this.docker.url }
    if (!file) return { ...base, available: true, compose: false, services: [], running: false, problem: 'This project has no docker-compose.yml.' }
    const [services, ps] = await Promise.all([run(composeArgs(file, this.docker.profiles, 'services'), this.root), run(composeArgs(file, this.docker.profiles, 'ps'), this.root)])
    if (services.code !== 0 || ps.code !== 0) {
      const text = (ps.code !== 0 ? ps.output : services.output).trim()
      const down = ps.code === -1 || /cannot connect|is the docker daemon running|not found|no such file/i.test(text)
      return {
        ...base,
        available: !down,
        compose: true,
        file,
        services: [],
        running: false,
        problem: down ? 'Docker is not running (or not installed).' : text.split('\n').slice(-3).join(' '),
      }
    }
    let states: DockerService[] = []
    try {
      states = parsePs(ps.output)
    } catch {
      states = []
    }
    const all: DockerService[] = services.output
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => states.find((s) => s.name === name) ?? { name, state: 'not created' })
    return { ...base, available: true, compose: true, file, services: all, running: all.length > 0 && all.every((s) => s.state === 'running') }
  }

  /** Starts the action (it runs on; its output and the end come as events). */
  async start(action: DockerAction): Promise<DockerStatus> {
    if (this.busy) throw new DockerError(`Docker is already busy (${this.busy.action}).`)
    const file = composeFile(this.root, this.docker)
    if (!file) throw new DockerError('This project has no docker-compose.yml.', 404)
    this.busy = { action, startedAt: new Date().toISOString() }
    const lines: string[] = []
    void (async () => {
      const result = await run(composeArgs(file, this.docker.profiles, action), this.root, (line) => {
        lines.push(line)
        if (lines.length > KEEP_LINES) lines.shift()
        this.notify({ status: { ...this.snapshot(file) }, line })
      })
      this.busy = undefined
      this.last = { action, ok: result.code === 0, at: new Date().toISOString(), output: (lines.length ? lines : result.output.split('\n')).slice(-KEEP_LINES).join('\n') }
      this.notify({ status: await this.status() })
    })()
    return this.snapshot(file)
  }

  /** What is known without asking docker (while an action runs). */
  private snapshot(file: string): DockerStatus {
    return { available: true, compose: true, file, services: [], running: false, url: this.docker.url, busy: this.busy, last: this.last }
  }
}
