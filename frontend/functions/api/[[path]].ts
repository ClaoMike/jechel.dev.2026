// Cloudflare Pages Function: every /api/* request on the site is forwarded to the API on Sliplane, so the
// browser only talks to one origin (the auth cookie stays first-party, no CORS), as the Vite proxy does locally.
// Uploaded files are kept at Cloudflare's edge on the way (see below), so most never reach the API twice.
// The API trusts what this says (host, visitor IP and country) because of the shared secret (backend ProxyHeaders.cs).
// Set in the Pages project: API_ORIGIN (the API service's address, e.g. https://jechel-api.sliplane.app) and PROXY_SECRET.

interface Env {
  API_ORIGIN: string
  PROXY_SECRET: string
}

/** The API's address as set, with https:// added if it was left out ("api-1234.sliplane.app"); null when it isn't set. */
export function apiOrigin(value: string | undefined): string | null {
  const origin = value?.trim().replace(/\/+$/, '')
  if (!origin) return null
  return /^https?:\/\//i.test(origin) ? origin : `https://${origin}`
}

/** An uploaded file's address (GET /api/files/{id}/{name}): public, the same for everyone, and never changing (a new upload is a new id). */
const FILE_PATH = /^\/api\/files\/[0-9a-f-]{36}\/[^/]+$/i

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}

/** Cloudflare's cache where this runs (the data centre nearest the visitor); none anywhere else (tests, a browser). */
function edgeCache(): EdgeCache | null {
  return (globalThis as { caches?: { default?: EdgeCache } }).caches?.default ?? null
}

interface Context {
  request: Request
  env: Env
  /** Keeps the function going after it answered (to finish keeping a file). */
  waitUntil?(promise: Promise<unknown>): void
}

export const onRequest = async (context: Context): Promise<Response> => {
  const { request, env } = context
  const origin = apiOrigin(env.API_ORIGIN)
  // A setup mistake, said plainly (and in the API's problem shape), rather than Cloudflare's "error 1101".
  if (!origin || !env.PROXY_SECRET) {
    return Response.json(
      { title: 'The site is not connected to its API (API_ORIGIN or PROXY_SECRET is not set).', status: 503 },
      { status: 503, headers: { 'Content-Type': 'application/problem+json' } },
    )
  }
  const url = new URL(request.url)
  const headers = new Headers(request.headers)
  headers.set('X-Proxy-Secret', env.PROXY_SECRET)
  headers.set('X-Site-Host', url.host)
  headers.set('X-Client-IP', request.headers.get('CF-Connecting-IP') ?? '')
  headers.set('X-Client-Country', request.headers.get('CF-IPCountry') ?? '')

  const forward = () =>
    fetch(new URL(url.pathname + url.search, origin), {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? null : request.body,
      // Redirects (Google sign-in) go back to the browser as they are.
      redirect: 'manual',
    })

  // Uploaded files (an app's images and videos, the photo, papers) are kept at Cloudflare's edge once fetched: the API
  // reads each from its database, whole, so without this every visitor's every image is the small server's work.
  // Only these: everything else under /api is live data, or the admin's.
  const cache = request.method === 'GET' && FILE_PATH.test(url.pathname) ? edgeCache() : null
  if (!cache) return forward()

  // By its address alone: no query, no cookie. The Range (a video asks for parts) is answered from the kept file.
  const key = new Request(url.origin + url.pathname)
  const range = request.headers.get('Range')
  const kept = await cache.match(range ? new Request(key, { headers: { Range: range } }) : key)
  if (kept) return kept

  // Nobody's session rides on a file: without the cookie, the answer is the same for everyone (and sets none).
  headers.delete('Cookie')
  const response = await forward()
  // Only a whole file can be kept (200). A part (206) is passed on as it is: asking the API for the rest of a
  // 200 MB video behind the visitor's back, once per part they ask for, would cost it more than it saves.
  if (response.status === 200) {
    const keeping = cache.put(key, response.clone()).catch(() => {})
    if (context.waitUntil) context.waitUntil(keeping)
    else await keeping
  }
  return response
}
