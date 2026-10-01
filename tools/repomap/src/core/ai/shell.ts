/**
 * The assistant's shell: one bash process per conversation, started in the repository, so `cd` and
 * variables persist between commands like in a terminal. Commands never wait for input (stdin is
 * /dev/null, no pagers, no prompts), output is capped, and a command that runs too long is killed
 * together with everything it started.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'

export const MAX_OUTPUT = 30_000

export interface ShellResult {
  output: string
  exitCode: number | null
  timedOut: boolean
}

export class ShellSession {
  private readonly cwd: string
  private child: ChildProcessWithoutNullStreams | null = null
  private queue: Promise<unknown> = Promise.resolve()

  constructor(cwd: string) {
    this.cwd = cwd
  }

  /** Runs one command (one at a time); the output is stdout and stderr as they arrived. */
  run(command: string, timeoutMs = 120_000): Promise<ShellResult> {
    const run = this.queue.catch(() => undefined).then(() => this.execute(command, timeoutMs))
    this.queue = run
    return run
  }

  /** A fresh shell (the old one and its children are stopped). */
  restart(): void {
    this.stop()
  }

  close(): void {
    this.stop()
  }

  private start(): ChildProcessWithoutNullStreams {
    const child = spawn('bash', ['--noprofile', '--norc'], {
      cwd: this.cwd,
      // Its own process group: a timeout stops the command's children too.
      detached: true,
      env: {
        ...process.env,
        TERM: 'dumb',
        PAGER: 'cat',
        GIT_PAGER: 'cat',
        GIT_TERMINAL_PROMPT: '0',
        GIT_EDITOR: 'true',
        GCM_INTERACTIVE: 'never',
        NO_COLOR: '1',
      },
    })
    child.on('exit', () => {
      if (this.child === child) this.child = null
    })
    // An idle shell never keeps the server from exiting.
    child.unref()
    for (const pipe of [child.stdin, child.stdout, child.stderr] as unknown as { unref?: () => void }[]) pipe.unref?.()
    this.child = child
    return child
  }

  private stop(): void {
    const child = this.child
    this.child = null
    if (!child?.pid) return
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }

  private execute(command: string, timeoutMs: number): Promise<ShellResult> {
    const child = this.child ?? this.start()
    const marker = `__repomap_done_${randomUUID().replace(/-/g, '')}__`
    return new Promise((resolveRun) => {
      let output = ''
      let dropped = 0
      const append = (chunk: Buffer) => {
        output += chunk.toString('utf8')
        // Keep the start and the end of long outputs (the end holds the errors and the summary).
        if (output.length > MAX_OUTPUT * 2) {
          const head = output.slice(0, MAX_OUTPUT / 2)
          const tail = output.slice(-MAX_OUTPUT)
          dropped += output.length - head.length - tail.length
          output = `${head}\u0000${tail}`
        }
      }
      const finish = (result: ShellResult) => {
        clearTimeout(timer)
        child.stdout.off('data', onStdout)
        child.stderr.off('data', append)
        child.off('exit', onExit)
        resolveRun(result)
      }
      const tidy = (text: string) => {
        let result = text.replace(/\u0000/, `\n… ${dropped} characters left out …\n`)
        if (result.length > MAX_OUTPUT) result = `${result.slice(0, MAX_OUTPUT / 3)}\n… ${result.length - MAX_OUTPUT} characters left out …\n${result.slice(-((MAX_OUTPUT * 2) / 3))}`
        return result.replace(/\s+$/, '')
      }
      const onStdout = (chunk: Buffer) => {
        append(chunk)
        const at = output.indexOf(marker)
        if (at < 0) return
        const code = Number(/^(\d+)/.exec(output.slice(at + marker.length))?.[1] ?? 'NaN')
        finish({ output: tidy(output.slice(0, at)), exitCode: Number.isNaN(code) ? null : code, timedOut: false })
      }
      const onExit = () => finish({ output: tidy(output), exitCode: null, timedOut: false })
      const timer = setTimeout(() => {
        this.stop()
        finish({ output: tidy(output), exitCode: null, timedOut: true })
      }, timeoutMs)
      child.stdout.on('data', onStdout)
      child.stderr.on('data', append)
      child.once('exit', onExit)
      // The braces keep multi-line commands together; stderr joins stdout, nothing reads stdin.
      child.stdin.write(`{\n${command}\n} < /dev/null 2>&1\nprintf '\\n${marker}%s\\n' "$?"\n`)
    })
  }
}
