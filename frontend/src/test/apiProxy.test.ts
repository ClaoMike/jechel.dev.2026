import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiOrigin, onRequest } from '../../functions/api/[[path]]'

// The site's /api forwarding (a Cloudflare Pages Function): to the API, with the secret and what the browser saw.

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("the API's address", () => {
  it('takes it as set, adding https:// when it was left out, without a trailing slash', () => {
    expect(apiOrigin('https://api-4axtxd.sliplane.app')).toBe('https://api-4axtxd.sliplane.app')
    expect(apiOrigin(' api-4axtxd.sliplane.app/ ')).toBe('https://api-4axtxd.sliplane.app')
    expect(apiOrigin('http://localhost:5105')).toBe('http://localhost:5105')
    expect(apiOrigin('')).toBeNull()
    expect(apiOrigin(undefined)).toBeNull()
  })
})

describe('forwarding', () => {
  it('sends the request on with the secret, the host, and the visitor’s address and country', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const request = new Request('https://jechel.dev/api/apps?page=2', { method: 'POST', body: '{"a":1}', headers: { 'CF-Connecting-IP': '203.0.113.7', 'CF-IPCountry': 'GB' } })

    const response = await onRequest({ request, env: { API_ORIGIN: 'api-4axtxd.sliplane.app', PROXY_SECRET: 's3cret' } })

    expect(response.status).toBe(200)
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit & { headers: Headers }]
    expect(url.toString()).toBe('https://api-4axtxd.sliplane.app/api/apps?page=2')
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('manual')
    expect(Object.fromEntries(['x-proxy-secret', 'x-site-host', 'x-client-ip', 'x-client-country'].map((h) => [h, init.headers.get(h)]))).toEqual({
      'x-proxy-secret': 's3cret',
      'x-site-host': 'jechel.dev',
      'x-client-ip': '203.0.113.7',
      'x-client-country': 'GB',
    })
  })

  it('a GET carries no body', async () => {
    const fetch = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetch)

    await onRequest({ request: new Request('https://jechel.dev/api/site'), env: { API_ORIGIN: 'https://api.example', PROXY_SECRET: 's' } })

    expect((fetch.mock.calls[0] as unknown as [URL, RequestInit])[1].body).toBeNull()
  })

  it('says plainly that it isn’t set up, instead of crashing', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    for (const env of [
      { API_ORIGIN: '', PROXY_SECRET: 's' },
      { API_ORIGIN: 'https://api.example', PROXY_SECRET: '' },
    ]) {
      const response = await onRequest({ request: new Request('https://jechel.dev/api/site'), env })
      expect(response.status).toBe(503)
      expect(((await response.json()) as { title: string }).title).toContain('API_ORIGIN or PROXY_SECRET')
    }
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe("uploaded files at Cloudflare's edge", () => {
  const env = { API_ORIGIN: 'https://api.example', PROXY_SECRET: 's' }
  const FILE = 'https://jechel.dev/api/files/0192f3a1-7c2e-7b1a-9f00-3c1d2e4f5a6b/screenshot.webp'

  /** A stand-in for caches.default: keeps what's put, by address. */
  function stubEdge() {
    const kept = new Map<string, Response>()
    const edge = {
      match: vi.fn(async (request: Request) => kept.get(request.url)?.clone()),
      put: vi.fn(async (request: Request, response: Response) => void kept.set(request.url, response)),
    }
    vi.stubGlobal('caches', { default: edge })
    return { edge, kept }
  }

  it('asks the API for a file once, then answers from the edge', async () => {
    const { edge } = stubEdge()
    const fetch = vi.fn(async () => new Response('image bytes', { status: 200, headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }))
    vi.stubGlobal('fetch', fetch)
    const waiting: Promise<unknown>[] = []
    const context = () => ({ request: new Request(`${FILE}?v=2`, { headers: { Cookie: 'portfolio.auth=abc' } }), env, waitUntil: (p: Promise<unknown>) => void waiting.push(p) })

    const first = await onRequest(context())
    expect(await first.text()).toBe('image bytes')
    await Promise.all(waiting)
    // Kept by its address alone, and asked for without the admin's cookie: the same answer for everyone.
    expect(edge.put.mock.calls[0][0].url).toBe(FILE)
    expect((fetch.mock.calls[0] as unknown as [URL, { headers: Headers }])[1].headers.get('cookie')).toBeNull()

    const second = await onRequest(context())
    expect(await second.text()).toBe('image bytes')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("asks the kept file for the part a video wants, and doesn't keep a part or a missing file", async () => {
    const { edge, kept } = stubEdge()
    const fetch = vi.fn(async (_url: URL, init: { headers: Headers }) => (init.headers.get('range') ? new Response('part', { status: 206 }) : new Response(null, { status: 404 })))
    vi.stubGlobal('fetch', fetch)

    const part = await onRequest({ request: new Request(FILE, { headers: { Range: 'bytes=0-3' } }), env })
    expect(part.status).toBe(206)
    expect((edge.match.mock.calls[0][0] as Request).headers.get('range')).toBe('bytes=0-3')
    expect((await onRequest({ request: new Request(FILE), env })).status).toBe(404)
    expect(edge.put).not.toHaveBeenCalled()
    expect(kept.size).toBe(0)
  })

  it('keeps nothing else: live data, the résumé, uploads on their way in', async () => {
    const { edge } = stubEdge()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))

    for (const request of [
      new Request('https://jechel.dev/api/apps'),
      new Request('https://jechel.dev/api/resume/private'),
      new Request('https://jechel.dev/api/files/photo', { method: 'POST', body: 'x' }),
      new Request(FILE, { method: 'HEAD' }),
    ])
      await onRequest({ request, env })
    expect(edge.match).not.toHaveBeenCalled()
    expect(edge.put).not.toHaveBeenCalled()
  })

  it('still answers when the edge refuses to keep a file', async () => {
    const { edge } = stubEdge()
    edge.put.mockRejectedValue(new Error('too large'))
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bytes')))

    expect(await (await onRequest({ request: new Request(FILE), env })).text()).toBe('bytes')
  })
})
