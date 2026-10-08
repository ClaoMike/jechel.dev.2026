/**
 * Runs plugins as separate processes: JSON request on stdin, JSON output on stdout, logs on stderr.
 * Any language works (the .NET extractor is a C# program).
 */
import { spawn, spawnSync } from 'node:child_process'
import type { PluginOutput, PluginRequest } from '../shared/types.ts'
import type { PluginConfig } from './config.ts'
import type { Logger } from './log.ts'
import { assertValidPluginOutput } from './validate.ts'

export interface CommandResult {
  code: number | null
  stdout: string
  stderr: string
}

function resolveCommand(command: string[]): [string, string[]] {
  const [exe, ...args] = command
  return [exe === 'node' ? process.execPath : exe, args]
}

export function runCommand(
  command: string[],
  options: { cwd: string; input?: string; timeoutMs?: number; onStderr?: (line: string) => void },
): Promise<CommandResult> {
  const [exe, args] = resolveCommand(command)
  return new Promise((resolvePromise, reject) => {
    const child = spawn(exe, args, { cwd: options.cwd, stdio: ['pipe', 'pipe', 'pipe'], env: process.env })
    const stdout: Buffer[] = []
    let stderr = ''
    let pending = ''
    const timer = options.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGKILL')
          reject(new Error(`timed out after ${options.timeoutMs} ms: ${command.join(' ')}`))
        }, options.timeoutMs)
      : undefined
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      stderr += text
      pending += text
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) if (line.trim()) options.onStderr?.(line)
    })
    child.on('error', (error) => {
      if (timer) clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (pending.trim()) options.onStderr?.(pending)
      resolvePromise({ code, stdout: Buffer.concat(stdout).toString('utf8'), stderr })
    })
    child.stdin.on('error', () => {
      // The child may exit before reading all input; the exit code tells the story.
    })
    child.stdin.end(options.input ?? '')
  })
}

const available = new Map<string, boolean>()

/** True if every required executable can be started. */
export function checkRequires(requires: string[] | undefined): string[] {
  const missing: string[] = []
  for (const exe of requires ?? []) {
    if (!available.has(exe)) {
      const result = spawnSync(exe, ['--version'], { stdio: 'ignore' })
      available.set(exe, !result.error && result.status === 0)
    }
    if (!available.get(exe)) missing.push(exe)
  }
  return missing
}

const builds = new Map<string, Promise<void>>()

/** Runs a plugin's build step once per process (shared by plugins with the same build command). */
export function ensureBuilt(plugin: PluginConfig, toolRoot: string, log: Logger): Promise<void> {
  if (!plugin.build) return Promise.resolve()
  const key = plugin.build.join('\u0000')
  let promise = builds.get(key)
  if (!promise) {
    promise = (async () => {
      log.step(`building plugin ${plugin.id}: ${plugin.build!.join(' ')}`)
      const result = await runCommand(plugin.build!, { cwd: toolRoot, timeoutMs: 10 * 60_000 })
      if (result.code !== 0) {
        throw new Error(`build failed (${result.code}):\n${(result.stdout + result.stderr).trim().slice(-4000)}`)
      }
    })()
    builds.set(key, promise)
  }
  return promise
}

export async function runPlugin(
  plugin: PluginConfig,
  request: PluginRequest,
  context: { toolRoot: string; log: Logger },
): Promise<PluginOutput> {
  await ensureBuilt(plugin, context.toolRoot, context.log)
  const result = await runCommand(plugin.command, {
    cwd: context.toolRoot,
    input: JSON.stringify(request),
    timeoutMs: plugin.timeoutMs ?? 10 * 60_000,
    onStderr: (line) => context.log.debug(`  [${plugin.id}] ${line}`),
  })
  if (result.code !== 0) {
    const tail = result.stderr.trim().split('\n').slice(-25).join('\n')
    throw new Error(`exited with code ${result.code}${tail ? `:\n${tail}` : ''}`)
  }
  let output: unknown
  try {
    output = JSON.parse(result.stdout)
  } catch {
    const preview = result.stdout.slice(0, 300)
    throw new Error(`did not print valid JSON on stdout. First bytes: ${JSON.stringify(preview)}`)
  }
  assertValidPluginOutput(plugin.id, output)
  return output
}
