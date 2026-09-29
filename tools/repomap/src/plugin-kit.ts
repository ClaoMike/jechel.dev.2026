/**
 * Helpers for plugins written in TypeScript. A plugin is any executable that reads a PluginRequest
 * (JSON) on stdin and prints a PluginOutput (JSON) on stdout; logs go to stderr.
 */
import type { PluginOutput, PluginRequest } from './shared/types.ts'
import { PROTOCOL_VERSION } from './shared/types.ts'

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

export async function runPlugin(handler: (request: PluginRequest) => PluginOutput | Promise<PluginOutput>): Promise<void> {
  try {
    const request = JSON.parse(await readStdin()) as PluginRequest
    if (request.protocol !== PROTOCOL_VERSION) {
      throw new Error(`unsupported protocol ${request.protocol} (expected ${PROTOCOL_VERSION})`)
    }
    const output = await handler(request)
    process.stdout.write(JSON.stringify({ ...output, protocol: PROTOCOL_VERSION }))
  } catch (error) {
    process.stderr.write(`${(error as Error).stack ?? String(error)}\n`)
    process.exitCode = 1
  }
}

export function log(message: string): void {
  process.stderr.write(`${message}\n`)
}
