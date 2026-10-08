/** Minimal stderr logger (stdout stays free for machine-readable output). */

const useColor = process.stderr.isTTY && !process.env.NO_COLOR

const paint = (code: number) => (text: string) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text)

export const color = {
  dim: paint(2),
  bold: paint(1),
  red: paint(31),
  green: paint(32),
  yellow: paint(33),
  blue: paint(34),
  magenta: paint(35),
  cyan: paint(36),
}

export interface Logger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
  debug(message: string): void
  step(message: string): void
}

export function createLogger(options: { quiet?: boolean; verbose?: boolean } = {}): Logger {
  const write = (line: string) => process.stderr.write(`${line}\n`)
  return {
    info: (message) => {
      if (!options.quiet) write(message)
    },
    step: (message) => {
      if (!options.quiet) write(`${color.cyan('›')} ${message}`)
    },
    warn: (message) => write(`${color.yellow('warn')} ${message}`),
    error: (message) => write(`${color.red('error')} ${message}`),
    debug: (message) => {
      if (options.verbose) write(color.dim(message))
    },
  }
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`
}
