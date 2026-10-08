import { execFileSync } from 'node:child_process'

export interface GitInfo {
  commit?: string
  branch?: string
  dirty?: boolean
}

function git(repoRoot: string, args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return undefined
  }
}

export function gitInfo(repoRoot: string): GitInfo {
  const commit = git(repoRoot, ['rev-parse', '--short', 'HEAD'])
  if (!commit) return {}
  const branch = git(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const status = git(repoRoot, ['status', '--porcelain'])
  return { commit, branch, dirty: !!status }
}
