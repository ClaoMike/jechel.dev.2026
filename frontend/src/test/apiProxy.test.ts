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
