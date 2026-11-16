/**
 * The "Claude Code" provider: repomap runs the `claude` CLI installed on this machine (`claude -p`),
 * signed in with your own Claude subscription, instead of calling the API with a key. Used for the
 * Board's AI (one-shot prompts, no tools) and for the chat assistant (Claude Code working in the
 * repository with its own tools, streamed as JSON lines).
 *
 * REPOMAP_CLAUDE points at another executable (tests use a stand-in script).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'

export class ClaudeCodeError extends Error {}

/** The `claude` executable: REPOMAP_CLAUDE, else the first on PATH; undefined when there is none. */
export function claudeBinary(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.REPOMAP_CLAUDE) return env.REPOMAP_CLAUDE
  const names = process.platform === 'win32' ? ['claude.exe', 'claude.cmd'] : ['claude']
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    for (const name of names) {
      const candidate = join(dir, name)
      try {
        accessSync(candidate, constants.X_OK)
        return candidate
      } catch {
        // not here
      }
    }
  }
  return undefined
}

export interface ClaudeRun {
  binary: string
  /** Sent on stdin (no length limit on the command line). */
  prompt: string
  args: string[]
  cwd: string
  signal?: AbortSignal
  /** Each JSON line of stream-json output. */
  onLine?(event: Record<string, unknown>): void
}

/** Runs `claude -p …` to the end; resolves with stdout (and the parsed lines when streaming). */
export function runClaude(run: ClaudeRun): Promise<string> {
  return new Promise((resolveRun, reject) => {
    let child: ChildProcess
    try {
      // CLAUDECODE: a run from inside a Claude Code session (repomap started by one) is still its own session.
      child = spawn(run.binary, ['-p', ...run.args], { cwd: run.cwd, env: { ...process.env, CLAUDECODE: '' }, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (error) {
      reject(new ClaudeCodeError(`Could not start Claude Code: ${(error as Error).message}`))
      return
    }
    let stdout = ''
    let stderr = ''
    let pending = ''
    const onAbort = () => child.kill('SIGTERM')
    run.signal?.addEventListener('abort', onAbort, { once: true })
    child.stdout!.setEncoding('utf8')
    child.stdout!.on('data', (chunk: string) => {
      stdout += chunk
      if (!run.onLine) return
      pending += chunk
      let newline = pending.indexOf('\n')
      while (newline >= 0) {
        const line = pending.slice(0, newline).trim()
        pending = pending.slice(newline + 1)
        if (line) {
          try {
            run.onLine(JSON.parse(line) as Record<string, unknown>)
          } catch {
            // not JSON (a warning): skip
          }
        }
        newline = pending.indexOf('\n')
      }
    })
    child.stderr!.setEncoding('utf8')
    child.stderr!.on('data', (chunk: string) => (stderr += chunk))
    child.on('error', (error) => reject(new ClaudeCodeError(`Could not start Claude Code (${run.binary}): ${error.message}`)))
    child.on('close', (code) => {
      run.signal?.removeEventListener('abort', onAbort)
      if (run.signal?.aborted) return reject(new ClaudeCodeError('Stopped'))
      if (code !== 0 && !stdout.trim()) return reject(new ClaudeCodeError(firstLine(stderr) || `Claude Code exited with ${code}`))
      resolveRun(stdout)
    })
    child.stdin!.on('error', () => undefined)
    child.stdin!.end(run.prompt)
  })
}

function firstLine(text: string): string {
  return text.split('\n').map((l) => l.trim()).find(Boolean) ?? ''
}

/**
 * One prompt, one answer, no tools: what the Board's AI needs. Runs outside the repository with
 * only the user's own settings, so no project hooks, MCP servers or CLAUDE.md come along.
 */
export async function askClaudeCode(options: { binary: string; model: string; system: string; prompt: string; cwd: string; signal?: AbortSignal }): Promise<string> {
  const stdout = await runClaude({
    binary: options.binary,
    prompt: options.prompt,
    cwd: options.cwd,
    signal: options.signal,
    args: ['--output-format', 'json', '--tools', '', '--no-session-persistence', '--strict-mcp-config', '--setting-sources', 'user', '--model', options.model, '--system-prompt', options.system],
  })
  let result: { result?: string; is_error?: boolean; subtype?: string }
  try {
    result = JSON.parse(stdout) as typeof result
  } catch {
    throw new ClaudeCodeError(`Claude Code answered something that isn't JSON: ${stdout.slice(0, 200)}`)
  }
  if (result.is_error || typeof result.result !== 'string') throw new ClaudeCodeError(result.result || `Claude Code failed (${result.subtype ?? 'error'})`)
  return result.result
}
