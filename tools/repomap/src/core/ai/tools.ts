/**
 * What the assistant can do in the repository, like Claude Code: read and edit files (Claude's own
 * text editor tool), run shell commands (Claude's bash tool), search the code, find files, look things
 * up in the architecture map, read the git state, run git commands, and delete or rename files.
 *
 * Every tool is classified (read / edit / git / shell) for permissions. Paths are untrusted model
 * output: each one is confined to the repository (symlinks included) and kept out of .git; files git
 * ignores (.env and the like) are neither read nor written. Edits are planned first (so the chat can
 * show the diff and ask), then applied.
 */
import { execFile, execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'
import picomatch from 'picomatch'
import type { ToolClass } from '../../shared/ai.ts'
import { unifiedDiff } from '../../shared/diff.ts'
import { actionProgress, type GitAction } from '../../shared/git-actions.ts'
import type { RepoGraph } from '../../shared/types.ts'
import { GitRequestError, runGitAction } from '../git-actions.ts'
import { MAX_SOURCE_BYTES } from '../source.ts'
import { applyFileOperation, checkPath, forgetWorkspace, workspaceFiles, WorkspaceError } from '../workspace.ts'
import type { ShellSession } from './shell.ts'

export const EDITOR_TOOL = 'str_replace_based_edit_tool'
export const MAX_RESULT = 40_000

export interface ToolContext {
  root: string
  graph(): RepoGraph | undefined
  shell: ShellSession
  /** Files changed on disk (the map rebuilds, open editors reload). */
  filesChanged(paths: string[]): void
  /** A git command ran (the history is re-read). */
  gitChanged(): Promise<void>
}

/** A tool call checked and ready: what it is, how the chat shows it, and how to run it. */
export interface PlannedCall {
  class: ToolClass
  title: string
  diff?: string
  run(): Promise<ToolOutcome>
}

export interface ToolOutcome {
  /** What the assistant reads. */
  content: string
  isError?: boolean
  /** What the chat shows (defaults to content). */
  display?: string
  diff?: string
  changed?: string[]
}

/** A call that can't run (bad input, a path out of bounds…): the assistant gets the reason. */
export class ToolInputError extends Error {}

type CustomTool = Anthropic.Beta.BetaTool

const CUSTOM_TOOLS: CustomTool[] = [
  {
    name: 'search_code',
    description:
      'Search the contents of the repository\'s files with a regular expression (git grep; ignored files are skipped). Use it to find where something is defined or used before reading files.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Extended regular expression' },
        path: { type: 'string', description: 'Optional folder or glob to search in, e.g. "frontend/src" or "**/*.cs"' },
        case_insensitive: { type: 'boolean' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'find_files',
    description: 'List the repository\'s files matching a glob (e.g. "**/*.test.tsx", "backend/**/Program.cs"). Ignored files are left out.',
    input_schema: {
      type: 'object',
      properties: { glob: { type: 'string' } },
      required: ['glob'],
    },
  },
  {
    name: 'map_query',
    description:
      'Look things up in the repository\'s architecture map (the graph repomap built: routes, pages, components, API calls, endpoints, services, entities, tables…). With "query": the nodes whose name, id or file matches. With "node" (an id or an exact name): that node\'s kind, layer, file and its incoming and outgoing edges. Use it to understand how parts connect across frontend, backend and database.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        node: { type: 'string' },
      },
    },
  },
  {
    name: 'show_on_board',
    description:
      'Point at parts of the app on the Board tab (the zoomable circuit-board view of the map) the user is looking at: it opens the board of the first one\'s feature and lights the others up. Give node ids or exact names (from map_query). Use it whenever an answer is about where things are or how they connect.',
    input_schema: {
      type: 'object',
      properties: {
        nodes: { type: 'array', items: { type: 'string' }, description: 'Node ids or exact names' },
      },
      required: ['nodes'],
    },
  },
  {
    name: 'git_info',
    description: 'Read the git state (never changes anything): status, diff of unstaged or staged changes, log, a commit, or the branches.',
    input_schema: {
      type: 'object',
      properties: {
        what: { type: 'string', enum: ['status', 'diff', 'staged_diff', 'log', 'show', 'branches'] },
        path: { type: 'string', description: 'Limit to a file or folder' },
        commit: { type: 'string', description: 'For "show": a commit hash' },
        max: { type: 'integer', description: 'For "log": how many commits (default 20)' },
      },
      required: ['what'],
    },
  },
  {
    name: 'git_command',
    description:
      'Run a git command that changes the repository, the same ones the History tab offers. "type" is one of: commit {summary, description?, files, amend?}, push {force?}, pull, fetch, create-branch {name, from?, checkout}, checkout {ref, target: branch|remote|commit}, rename-branch {from, to}, delete-branch {name, force?}, merge {ref, squash?}, rebase {onto}, abort, continue, stash {message?}, stash-pop {index}, discard {files}, undo-commit, revert {commit}, cherry-pick {commit}, reset {commit, mode}, create-tag {name, commit, message?}, delete-tag {name}, push-tag {name}. Only commit or push when the user asked for it.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        summary: { type: 'string' },
        description: { type: 'string' },
        files: { type: 'array', items: { type: 'string' } },
        amend: { type: 'boolean' },
        force: { type: 'boolean' },
        name: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
        checkout: { type: 'boolean' },
        ref: { type: 'string' },
        target: { type: 'string', enum: ['branch', 'remote', 'commit'] },
        squash: { type: 'boolean' },
        onto: { type: 'string' },
        message: { type: 'string' },
        index: { type: 'integer' },
        commit: { type: 'string' },
        mode: { type: 'string', enum: ['soft', 'mixed', 'hard'] },
      },
      required: ['type'],
    },
  },
  {
    name: 'manage_files',
    description: 'Delete a file or folder, or rename / move one (folders are created as needed). To create or change a file, use the text editor tool.',
    input_schema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['delete', 'rename'] },
        path: { type: 'string' },
        to: { type: 'string', description: 'For rename: the new path' },
      },
      required: ['operation', 'path'],
    },
  },
]

/** The tools sent with every request (a fixed list and order: it is part of the cached prefix). */
export function toolDefinitions(options: { webTools: boolean }): Anthropic.Beta.BetaToolUnion[] {
  return [
    { type: 'text_editor_20250728', name: EDITOR_TOOL },
    { type: 'bash_20250124', name: 'bash' },
    // Streamed as generated (file bodies can be long); inputs are validated before running.
    ...CUSTOM_TOOLS.map((tool) => ({ ...tool, eager_input_streaming: true })),
    ...(options.webTools
      ? ([
          { type: 'web_search_20260209', name: 'web_search' },
          { type: 'web_fetch_20260209', name: 'web_fetch' },
        ] satisfies Anthropic.Beta.BetaToolUnion[])
      : []),
  ]
}

/** Checks a call and prepares it (an edit computes its diff here, before anyone approves it). */
export function planCall(name: string, input: unknown, context: ToolContext): PlannedCall {
  const args = asObject(input)
  switch (name) {
    case EDITOR_TOOL:
      return planEditor(args, context)
    case 'bash':
      return planBash(args, context)
    case 'search_code':
      return planSearch(args, context)
    case 'find_files': {
      const glob = text(args, 'glob')
      return { class: 'read', title: `Find ${glob}`, run: async () => findFiles(context.root, glob) }
    }
    case 'map_query': {
      const query = optionalText(args, 'query')
      const node = optionalText(args, 'node')
      if (!query && !node) throw new ToolInputError('Give "query" or "node".')
      return { class: 'read', title: node ? `Look up ${node} in the map` : `Search the map for “${query}”`, run: async () => mapQuery(context.graph(), query, node) }
    }
    case 'show_on_board': {
      const refs = Array.isArray(args.nodes) ? args.nodes.filter((n): n is string => typeof n === 'string').slice(0, 40) : []
      if (refs.length === 0) throw new ToolInputError('Give "nodes": ids or names.')
      return {
        class: 'read',
        title: `Show ${refs.length === 1 ? refs[0] : `${refs.length} parts`} on the board`,
        run: async () => {
          const graph = context.graph()
          if (!graph) return { content: 'The map is not built yet.', isError: true }
          const found = refs.map((ref) => graph.nodes.find((n) => n.id === ref) ?? graph.nodes.find((n) => n.label === ref))
          const missing = refs.filter((_, k) => !found[k])
          const shown = found.filter(Boolean).map((n) => `${n!.label} (${n!.feature ?? 'shared'}, ${n!.layer})`)
          return {
            content: `${shown.length ? `Shown on the board: ${shown.join(', ')}.` : 'Nothing shown.'}${missing.length ? ` Not in the map: ${missing.join(', ')} (look them up with map_query).` : ''}`,
            isError: shown.length === 0,
          }
        },
      }
    }
    case 'git_info':
      return planGitInfo(args, context)
    case 'git_command': {
      const action = args as unknown as GitAction
      if (typeof action.type !== 'string') throw new ToolInputError('"type" is required.')
      return {
        class: 'git',
        title: `git: ${actionProgress(action).replace(/…$/, '')}`,
        run: async () => {
          try {
            const result = await runGitAction(context.root, action)
            forgetWorkspace(context.root)
            await context.gitChanged().catch(() => undefined)
            context.filesChanged([])
            if (result.ok) return { content: [result.message, result.output].filter(Boolean).join('\n\n') }
            return { content: `git failed: ${result.error}\n\n${result.output ?? ''}`.trim(), isError: true }
          } catch (error) {
            if (error instanceof GitRequestError) return { content: error.message, isError: true }
            throw error
          }
        },
      }
    }
    case 'manage_files':
      return planManageFiles(args, context)
    default:
      throw new ToolInputError(`Unknown tool ${name}`)
  }
}

// ---------------------------------------------------------------- the text editor

function planEditor(args: Record<string, unknown>, context: ToolContext): PlannedCall {
  const command = text(args, 'command')
  const { rel, full } = repoPath(context.root, text(args, 'path'))
  switch (command) {
    case 'view': {
      const range = args.view_range
      return {
        class: 'read',
        title: `Read ${rel || '.'}`,
        run: async () => {
          if (existsSync(full) && statSync(full).isDirectory()) return { content: listDirectory(context.root, rel) }
          const source = readText(context.root, rel, full)
          return { content: numbered(source, Array.isArray(range) ? (range as number[]) : undefined), display: `${source.split('\n').length} lines` }
        },
      }
    }
    case 'create': {
      const fileText = typeof args.file_text === 'string' ? args.file_text : ''
      if (Buffer.byteLength(fileText) > MAX_SOURCE_BYTES) throw new ToolInputError('The file would be larger than 2 MB.')
      const exists = existsSync(full)
      const before = exists ? readText(context.root, rel, full) : ''
      if (!exists) checkWritable(context.root, rel)
      return {
        class: 'edit',
        title: `${exists ? 'Rewrite' : 'Create'} ${rel}`,
        diff: unifiedDiff(before, fileText, rel),
        run: async () => {
          if (exists) writeFileSync(full, fileText)
          else applyFileOperation(context.root, { op: 'create', path: rel, content: fileText })
          forgetWorkspace(context.root)
          return { content: `${exists ? 'Rewrote' : 'Created'} ${rel}`, diff: unifiedDiff(before, fileText, rel), changed: [rel] }
        },
      }
    }
    case 'str_replace': {
      const before = readText(context.root, rel, full)
      const oldStr = text(args, 'old_str', true)
      const newStr = typeof args.new_str === 'string' ? args.new_str : ''
      const count = before.split(oldStr).length - 1
      if (count === 0) throw new ToolInputError(`No match for old_str in ${rel}. Read the file again: the text must match exactly, whitespace included.`)
      if (count > 1) throw new ToolInputError(`old_str matches ${count} places in ${rel}; include more surrounding lines so it matches one.`)
      const after = before.replace(oldStr, () => newStr)
      return planWrite(rel, full, before, after, `Edit ${rel}`)
    }
    case 'insert': {
      const before = readText(context.root, rel, full)
      const line = Number(args.insert_line)
      const insertText = typeof args.insert_text === 'string' ? args.insert_text : ''
      const lines = before.split('\n')
      if (!Number.isInteger(line) || line < 0 || line > lines.length) throw new ToolInputError(`insert_line must be between 0 and ${lines.length}.`)
      const inserted = insertText.endsWith('\n') ? insertText.slice(0, -1) : insertText
      const after = [...lines.slice(0, line), ...inserted.split('\n'), ...lines.slice(line)].join('\n')
      return planWrite(rel, full, before, after, `Edit ${rel}`)
    }
    default:
      throw new ToolInputError(`Unknown text editor command ${command}`)
  }
}

function planWrite(rel: string, full: string, before: string, after: string, title: string): PlannedCall {
  const diff = unifiedDiff(before, after, rel)
  return {
    class: 'edit',
    title,
    diff,
    run: async () => {
      // Changed since it was planned (the user typed in the editor meanwhile): don't overwrite.
      if (readFileSync(full, 'utf8') !== before) return { content: `${rel} changed since this edit was planned (it was edited meanwhile). Read it again and redo the edit.`, isError: true }
      writeFileSync(full, after)
      return { content: `Edited ${rel}`, diff, changed: [rel] }
    },
  }
}

/** A repository path from the model: relative, or absolute inside the repository. */
function repoPath(root: string, requested: string): { rel: string; full: string } {
  let path = requested.trim()
  const base = resolve(root)
  if (isAbsolute(path)) {
    const inside = relative(base, resolve(path))
    if (inside === '') return { rel: '', full: base }
    if (inside.startsWith('..') || isAbsolute(inside)) throw new ToolInputError(`${requested} is outside the repository (${base}).`)
    path = inside.split(sep).join('/')
  }
  if (path === '' || path === '.' || path === './') return { rel: '', full: base }
  try {
    return checkPath(root, path)
  } catch (error) {
    if (error instanceof WorkspaceError) throw new ToolInputError(`${requested}: ${error.message}`)
    throw error
  }
}

/** Git ignores it (a .env, build output…): out of the assistant's reach. */
function ignored(root: string, rel: string): boolean {
  const { set } = workspaceFiles(root)
  return !set.has(rel)
}

function readText(root: string, rel: string, full: string): string {
  if (!existsSync(full)) throw new ToolInputError(`${rel} does not exist.`)
  if (ignored(root, rel)) throw new ToolInputError(`${rel} is ignored by git (it may hold secrets), so it is not readable here.`)
  const stat = statSync(full)
  if (stat.size > MAX_SOURCE_BYTES) throw new ToolInputError(`${rel} is larger than 2 MB.`)
  const buffer = readFileSync(full)
  if (buffer.includes(0)) throw new ToolInputError(`${rel} is a binary file.`)
  return buffer.toString('utf8')
}

/** A new file must not be one git ignores (so nothing lands where secrets or build output live). */
function checkWritable(root: string, rel: string): void {
  const out = gitSync(root, ['check-ignore', '-q', '--', rel])
  if (out.code === 0) throw new ToolInputError(`${rel} would be ignored by git; create files elsewhere.`)
}

function numbered(source: string, range?: number[]): string {
  const lines = source.split('\n')
  const start = range?.[0] && range[0] > 0 ? range[0] : 1
  const end = range?.[1] && range[1] > 0 ? Math.min(range[1], lines.length) : lines.length
  let result = ''
  for (let n = start; n <= end; n++) {
    result += `${String(n).padStart(6)}\t${lines[n - 1]}\n`
    if (result.length > MAX_RESULT) return `${result}… (truncated at line ${n} of ${lines.length}; use view_range for the rest)`
  }
  return result
}

function listDirectory(root: string, rel: string): string {
  const prefix = rel ? `${rel}/` : ''
  const entries = new Set<string>()
  for (const file of workspaceFiles(root).files) {
    if (!file.startsWith(prefix)) continue
    const parts = file.slice(prefix.length).split('/')
    // Two levels, like the text editor's reference implementation.
    entries.add(parts.length > 2 ? `${parts.slice(0, 2).join('/')}/` : parts.join('/'))
  }
  const list = [...entries].sort()
  if (list.length === 0) return `${rel || '.'} is empty (or holds only ignored files).`
  return truncate(`${rel || '.'}/\n${list.map((entry) => `  ${entry}`).join('\n')}`)
}

// ---------------------------------------------------------------- shell, search, files, map, git

function planBash(args: Record<string, unknown>, context: ToolContext): PlannedCall {
  if (args.restart === true) {
    return {
      class: 'shell',
      title: 'Restart the shell',
      run: async () => {
        context.shell.restart()
        return { content: 'The shell was restarted.' }
      },
    }
  }
  const command = text(args, 'command')
  const first = command.split('\n')[0]
  return {
    class: 'shell',
    title: `Run ${first.length > 80 ? `${first.slice(0, 80)}…` : first}${command.includes('\n') ? ' …' : ''}`,
    run: async () => {
      const result = await context.shell.run(command)
      // Commands can change files: the map and open editors catch up.
      forgetWorkspace(context.root)
      context.filesChanged([])
      const status = result.timedOut ? '\n[stopped: it ran longer than 2 minutes]' : result.exitCode ? `\n[exit code ${result.exitCode}]` : ''
      return { content: `${result.output || '(no output)'}${status}`, isError: result.timedOut || (result.exitCode ?? 0) !== 0 }
    },
  }
}

function planSearch(args: Record<string, unknown>, context: ToolContext): PlannedCall {
  const pattern = text(args, 'pattern')
  const path = optionalText(args, 'path')
  return {
    class: 'read',
    title: `Search for “${pattern}”${path ? ` in ${path}` : ''}`,
    run: async () => {
      const spec = path ? (/[*?[]/.test(path) ? `:(glob)${path}` : path) : '.'
      const grep = (syntax: string) => git(context.root, ['grep', '--untracked', '-n', '-I', '--no-color', syntax, ...(args.case_insensitive ? ['-i'] : []), '-e', pattern, '--', spec])
      // Perl syntax (\w, \d, \s… as Claude writes them); extended regexes where git lacks PCRE.
      let out = await grep('-P')
      if (out.code > 1 && /PCRE|perl/i.test(out.stderr)) out = await grep('-E')
      if (out.code === 1) return { content: 'No matches.' }
      if (out.code !== 0) return { content: out.stderr || 'The search failed.', isError: true }
      const lines = out.stdout.split('\n').filter(Boolean)
      const shown = lines.slice(0, 300).map((line) => (line.length > 300 ? `${line.slice(0, 300)}…` : line))
      return { content: truncate(`${shown.join('\n')}${lines.length > shown.length ? `\n… ${lines.length - shown.length} more matches (narrow the search)` : ''}`), display: `${lines.length} matches` }
    },
  }
}

function findFiles(root: string, glob: string): ToolOutcome {
  const isMatch = picomatch(glob, { dot: true })
  const found = workspaceFiles(root).files.filter((file) => isMatch(file))
  if (found.length === 0) return { content: 'No files match.' }
  return { content: truncate(`${found.slice(0, 500).join('\n')}${found.length > 500 ? `\n… ${found.length - 500} more` : ''}`), display: `${found.length} files` }
}

export function mapQuery(graph: RepoGraph | undefined, query?: string, nodeRef?: string): ToolOutcome {
  if (!graph) return { content: 'The map is not built yet.', isError: true }
  const describe = (id: string) => {
    const node = graph.nodes.find((n) => n.id === id)
    return node ? `${node.label} [${node.kind}, ${node.layer}]` : id
  }
  if (nodeRef) {
    const node = graph.nodes.find((n) => n.id === nodeRef) ?? graph.nodes.find((n) => n.label === nodeRef)
    if (!node) return { content: `No node ${nodeRef}. Search with "query" first.`, isError: true }
    const out = graph.edges.filter((e) => e.from === node.id).slice(0, 60)
    const into = graph.edges.filter((e) => e.to === node.id).slice(0, 60)
    const lines = [
      `${node.label} (${node.id})`,
      `kind: ${node.kind} · layer: ${node.layer} · role: ${node.role}`,
      node.file ? `file: ${node.file}${node.line ? `:${node.line}${node.endLine ? `-${node.endLine}` : ''}` : ''}` : '',
      node.description ? `description: ${node.description}` : '',
      node.attrs ? `attributes: ${JSON.stringify(node.attrs)}` : '',
      node.parent ? `inside: ${describe(node.parent)}` : '',
      out.length ? `outgoing:\n${out.map((e) => `  -${e.type}-> ${describe(e.to)}`).join('\n')}` : 'outgoing: none',
      into.length ? `incoming:\n${into.map((e) => `  ${describe(e.from)} -${e.type}->`).join('\n')}` : 'incoming: none',
    ]
    const unresolved = graph.unresolved.filter((u) => u.from === node.id)
    if (unresolved.length) lines.push(`unresolved: ${unresolved.map((u) => `${u.target} (${u.reason})`).join('; ')}`)
    return { content: lines.filter(Boolean).join('\n') }
  }
  const words = query!.toLowerCase().split(/\s+/).filter(Boolean)
  const scored = graph.nodes
    .map((node) => {
      const hay = `${node.label} ${node.id} ${node.file ?? ''}`.toLowerCase()
      if (!words.every((w) => hay.includes(w))) return null
      return { node, score: (node.label.toLowerCase() === query!.toLowerCase() ? 0 : node.label.toLowerCase().includes(words[0]) ? 1 : 2) + node.label.length / 1000 }
    })
    .filter((x): x is { node: RepoGraph['nodes'][number]; score: number } => !!x)
    .sort((a, b) => a.score - b.score)
    .slice(0, 40)
  if (scored.length === 0) return { content: `Nothing in the map matches “${query}”.` }
  return {
    content: scored.map(({ node }) => `${node.id} | ${node.kind} | ${node.layer} | ${node.label}${node.file ? ` | ${node.file}${node.line ? `:${node.line}` : ''}` : ''}`).join('\n'),
    display: `${scored.length} nodes`,
  }
}

function planGitInfo(args: Record<string, unknown>, context: ToolContext): PlannedCall {
  const what = text(args, 'what')
  const path = optionalText(args, 'path')
  const commit = optionalText(args, 'commit')
  const max = Math.min(200, Math.max(1, Number(args.max) || 20))
  const limit = path ? ['--', repoPath(context.root, path).rel || '.'] : []
  const commands: Record<string, string[]> = {
    status: ['status', '--short', '--branch', ...limit],
    diff: ['diff', ...limit],
    staged_diff: ['diff', '--cached', ...limit],
    log: ['log', `-${max}`, '--format=%h %ad %an: %s', '--date=short', ...limit],
    show: ['show', '--stat', '--patch', commit ?? 'HEAD'],
    branches: ['branch', '-a', '-vv'],
  }
  if (!commands[what]) throw new ToolInputError(`Unknown "what": ${what}`)
  if (what === 'show' && commit && !/^[0-9a-f]{4,64}$/i.test(commit)) throw new ToolInputError('commit must be a hash')
  return {
    class: 'read',
    title: `git ${what.replace('_', ' ')}${path ? ` ${path}` : ''}`,
    run: async () => {
      const out = await git(context.root, commands[what])
      if (out.code !== 0) return { content: out.stderr || `git ${what} failed`, isError: true }
      return { content: truncate(out.stdout.trim() || '(nothing)') }
    },
  }
}

function planManageFiles(args: Record<string, unknown>, context: ToolContext): PlannedCall {
  const operation = text(args, 'operation')
  const from = repoPath(context.root, text(args, 'path'))
  if (operation === 'delete') {
    return {
      class: 'edit',
      title: `Delete ${from.rel}`,
      run: async () => fileOperation(context, { op: 'delete', path: from.rel }, [from.rel]),
    }
  }
  if (operation === 'rename') {
    const to = repoPath(context.root, text(args, 'to'))
    return {
      class: 'edit',
      title: `Rename ${from.rel} → ${to.rel}`,
      run: async () => fileOperation(context, { op: 'rename', from: from.rel, to: to.rel }, [from.rel, to.rel]),
    }
  }
  throw new ToolInputError('operation must be "delete" or "rename"')
}

function fileOperation(context: ToolContext, operation: Parameters<typeof applyFileOperation>[1], paths: string[]): ToolOutcome {
  try {
    const result = applyFileOperation(context.root, operation)
    forgetWorkspace(context.root)
    return { content: result.message, changed: paths }
  } catch (error) {
    if (error instanceof WorkspaceError) return { content: error.message, isError: true }
    throw error
  }
}

// ---------------------------------------------------------------- helpers

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ToolInputError('The input must be an object.')
  return input as Record<string, unknown>
}

function text(args: Record<string, unknown>, key: string, allowEmpty = false): string {
  const value = args[key]
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) throw new ToolInputError(`"${key}" is required (text).`)
  if (allowEmpty && value === '') throw new ToolInputError(`"${key}" must not be empty.`)
  return value
}

function optionalText(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new ToolInputError(`"${key}" must be text.`)
  return value
}

export function truncate(value: string, max = MAX_RESULT): string {
  return value.length > max ? `${value.slice(0, max)}\n… (${value.length - max} more characters)` : value
}

interface GitOut {
  code: number
  stdout: string
  stderr: string
}

function git(cwd: string, args: string[]): Promise<GitOut> {
  return new Promise((resolveRun) => {
    execFile('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 30_000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C', GIT_PAGER: 'cat' } }, (error, stdout, stderr) => {
      resolveRun({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout, stderr: stderr.trim() })
    })
  })
}

function gitSync(cwd: string, args: string[]): { code: number } {
  try {
    execFileSync('git', args, { cwd, stdio: 'ignore' })
    return { code: 0 }
  } catch (error) {
    return { code: (error as { status?: number }).status ?? 1 }
  }
}
