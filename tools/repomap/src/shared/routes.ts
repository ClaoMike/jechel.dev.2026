/**
 * URL and route-template normalisation + matching, shared by the HTTP linker and tests.
 *
 * Handles the shapes that show up in real code:
 *   backend templates   /api/books/{id}, /api/books/{id:int}, /files/{*path}
 *   frontend routes     /books/:id, /docs/*
 *   call sites          `${API_BASE_URL}/api/books/${id}?page=2`, {{host}}/api/x, http://localhost:5105/api/x,
 *                       Playwright globs like '**\/api/auth/me'
 */

export type SegmentKind = 'literal' | 'param' | 'catchAll'

export interface Segment {
  kind: SegmentKind
  /** Lower-cased literal text, or the parameter name. */
  value: string
  optional?: boolean
}

/**
 * Turns any URL-ish string into a normalised absolute path, or null when it is not a path
 * (e.g. a bare word, or a URL whose path is fully dynamic).
 */
export function normalizeUrl(input: string): string | null {
  let url = input.trim()
  if (!url) return null

  // Playwright/minimatch globs: '**/api/x' or '*/api/x' → '/api/x'
  url = url.replace(/^\*{1,2}(?=\/)/, '')
  // Absolute origin: http://localhost:5105/api/x → /api/x
  url = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '')
  // Leading base-URL placeholders: ${API_BASE_URL}/api/x, {{host}}/api/x (possibly several)
  for (;;) {
    const match = /^(\$\{[^}]*\}|\{\{[^}]*\}\})/.exec(url)
    if (!match) break
    url = url.slice(match[0].length)
  }
  if (!url.startsWith('/')) return null

  url = stripQuery(url)
  url = url.replace(/\/{2,}/g, '/')
  if (url.length > 1) url = url.replace(/\/+$/, '')
  return url || '/'
}

/** Removes ?query and #hash, ignoring '?' inside ${...} placeholders. */
function stripQuery(url: string): string {
  let depth = 0
  for (let i = 0; i < url.length; i++) {
    const char = url[i]
    if (char === '$' && url[i + 1] === '{') {
      depth++
      i++
    } else if (char === '}' && depth > 0) {
      depth--
    } else if ((char === '?' || char === '#') && depth === 0) {
      return url.slice(0, i)
    }
  }
  return url
}

export function parseSegments(path: string): Segment[] {
  if (path === '/' || path === '') return []
  return path
    .replace(/^\//, '')
    .split('/')
    .map(parseSegment)
}

function parseSegment(raw: string): Segment {
  if (raw === '*' || raw === '**') return { kind: 'catchAll', value: '*' }
  // {*rest} / {**rest} (ASP.NET catch-all)
  const catchAll = /^\{\*{1,2}([^}]*)\}$/.exec(raw)
  if (catchAll) return { kind: 'catchAll', value: catchAll[1] }
  // {id} / {id:int} / {id?}
  const aspParam = /^\{([^}:?]+)(?::[^}?]*)?(\?)?\}$/.exec(raw)
  if (aspParam) return { kind: 'param', value: aspParam[1], optional: !!aspParam[2] }
  // :id / :id? (React Router, Express)
  const colonParam = /^:([A-Za-z_][\w-]*)(\?)?$/.exec(raw)
  if (colonParam) return { kind: 'param', value: colonParam[1], optional: !!colonParam[2] }
  // [id] (file-based routers)
  const bracketParam = /^\[([^\]]+)\]$/.exec(raw)
  if (bracketParam) return { kind: 'param', value: bracketParam[1] }
  // Anything containing a ${...} or {...} placeholder is dynamic at the call site.
  if (/\$\{[^}]*\}|\{[^}]*\}/.test(raw)) return { kind: 'param', value: raw }
  let literal = raw
  try {
    literal = decodeURIComponent(raw)
  } catch {
    // keep raw
  }
  return { kind: 'literal', value: literal.toLowerCase() }
}

/**
 * How well a concrete call path matches a route template: 0 = no match, 1 = exact.
 * Literal segments must be equal; parameters match anything; a catch-all matches the rest.
 */
export function matchSegments(call: Segment[], route: Segment[]): number {
  let score = 1
  for (let i = 0; i < route.length; i++) {
    const routeSegment = route[i]
    if (routeSegment.kind === 'catchAll') return score * 0.8
    const callSegment = call[i]
    if (!callSegment) {
      // Trailing optional parameters may be omitted.
      return route.slice(i).every((s) => s.optional) ? score * 0.9 : 0
    }
    if (callSegment.kind === 'catchAll') return score * 0.5
    if (routeSegment.kind === 'literal') {
      if (callSegment.kind === 'literal') {
        if (callSegment.value !== routeSegment.value) return 0
      } else {
        // The call has a dynamic segment where the route expects a fixed word: possible, not proven.
        score *= 0.6
      }
    } else {
      score *= callSegment.kind === 'literal' ? 0.95 : 0.9
    }
  }
  return call.length === route.length ? score : 0
}

export function methodMatches(callMethod: string | undefined, routeMethod: string | undefined): boolean {
  if (!callMethod || !routeMethod) return true
  const call = callMethod.toUpperCase()
  const route = routeMethod.toUpperCase()
  return call === 'ANY' || route === 'ANY' || call === route || (call === 'HEAD' && route === 'GET')
}

export interface RouteCandidate<T> {
  method?: string
  path: string
  value: T
}

export interface RouteMatch<T> {
  value: T
  score: number
}

/** Finds the best matching route for a call (method + URL), or null. */
export function findBestRoute<T>(
  method: string | undefined,
  url: string,
  candidates: readonly RouteCandidate<T>[],
): RouteMatch<T> | null {
  const path = normalizeUrl(url)
  if (path === null) return null
  const callSegments = parseSegments(path)
  let best: RouteMatch<T> | null = null
  let bestLiterals = -1
  for (const candidate of candidates) {
    if (!methodMatches(method, candidate.method)) continue
    const routeSegments = parseSegments(candidate.path)
    const score = matchSegments(callSegments, routeSegments)
    if (score <= 0) continue
    const literals = routeSegments.filter((s) => s.kind === 'literal').length
    if (!best || score > best.score || (score === best.score && literals > bestLiterals)) {
      best = { value: candidate.value, score }
      bestLiterals = literals
    }
  }
  return best
}

/** Joins route prefixes the way ASP.NET MapGroup and nested React Router routes do. */
export function joinRoute(...parts: string[]): string {
  const joined = parts
    .filter((p) => p !== undefined && p !== null)
    .map((p) => p.trim())
    .filter((p) => p !== '' && p !== '/')
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .join('/')
  return `/${joined}`
}
