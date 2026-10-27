/**
 * Review mode, server side: the diff between two revisions (or the uncommitted changes), read with git.
 * Read-only: allowed on any server that serves the repository (phones on the LAN included).
 */
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseUnifiedDiff, WORKTREE, type ReviewDiff } from '../shared/review.ts'

const PATCH_LIMIT = 200_000

export class ReviewError extends Error {}

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolveRun, reject) => {
    execFile('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 30_000, env: { ...process.env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' } }, (error, stdout, stderr) => {
      if (error) reject(new ReviewError((stderr || error.message).trim().split('\n')[0]))
      else resolveRun(stdout)
    })
  })
}

/** A ref, a commit or `WORKTREE`; nothing git could read as an option. */
export function checkRevision(value: string | null | undefined): string {
  const revision = (value ?? '').trim()
  if (!revision || revision.startsWith('-') || !/^[\w./~^@{}-]+$/.test(revision) || revision.includes('..')) throw new ReviewError(`Not a revision: ${JSON.stringify(value)}`)
  return revision
}

/**
 * The changes from `base` to `head`. `head` = WORKTREE: the uncommitted changes (against `base`,
 * default HEAD), new untracked files included. Otherwise `base...head` (what head adds since they parted);
 * without a base, the commit `head` against its first parent.
 */
export async function readReviewDiff(repoRoot: string, baseInput: string | null, headInput: string | null): Promise<ReviewDiff> {
  const head = checkRevision(headInput ?? WORKTREE)
  let base: string
  let range: string[]
  let label: string
  if (head === WORKTREE) {
    base = baseInput ? checkRevision(baseInput) : 'HEAD'
    range = [base]
    label = base === 'HEAD' ? 'Uncommitted changes' : `Uncommitted changes against ${base}`
  } else if (baseInput) {
    base = checkRevision(baseInput)
    range = [`${base}...${head}`]
    label = `${head} against ${base}`
  } else {
    base = `${head}^`
    // A root commit has no parent: compare with the empty tree.
    const parent = await git(repoRoot, ['rev-parse', '--verify', '--quiet', `${head}^`]).catch(() => '')
    range = parent.trim() ? [`${head}^`, head] : ['4b825dc642cb6eb9a060e54bf8d69288fbee4904', head]
    const subject = await git(repoRoot, ['log', '-1', '--format=%h %s', head]).catch(() => head)
    label = subject.trim() || head
  }
  const files = parseUnifiedDiff(await git(repoRoot, ['diff', '--no-color', '--no-ext-diff', '--unified=0', '--find-renames', ...range, '--']))
  let patch = await git(repoRoot, ['diff', '--no-color', '--no-ext-diff', '--find-renames', ...range, '--'])
  if (head === WORKTREE) {
    // New files git doesn't track yet are changes too.
    const untracked = (await git(repoRoot, ['ls-files', '--others', '--exclude-standard'])).split('\n').filter(Boolean)
    for (const path of untracked) {
      let lines = 0
      try {
        const text = readFileSync(join(repoRoot, path), 'utf8')
        lines = text.split('\n').length
        if (patch.length < PATCH_LIMIT) patch += `\ndiff --git a/${path} b/${path}\nnew file (untracked)\n+++ b/${path}\n${text.split('\n').map((l) => `+${l}`).join('\n')}\n`
      } catch {
        // Unreadable (binary, gone): listed without lines.
      }
      files.push({ path, status: 'added', added: lines, removed: 0, ranges: lines ? [[1, lines]] : [] })
    }
  }
  const truncated = patch.length > PATCH_LIMIT
  return { base, head, label, files, patch: truncated ? patch.slice(0, PATCH_LIMIT) : patch, ...(truncated ? { truncated } : {}) }
}
