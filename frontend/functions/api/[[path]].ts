// Cloudflare Pages Function: every /api/* request on the site is forwarded to the API on Sliplane, so the
// browser only talks to one origin (the auth cookie stays first-party, no CORS), as the Vite proxy does locally.
// The API trusts what this says (host, visitor IP and country) because of the shared secret (backend ProxyHeaders.cs).
// Set in the Pages project: API_ORIGIN (the API service's address, e.g. https://jechel-api.sliplane.app) and PROXY_SECRET.

interface Env {
  API_ORIGIN: string
  PROXY_SECRET: string
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const url = new URL(request.url)
  const headers = new Headers(request.headers)
  headers.set('X-Proxy-Secret', env.PROXY_SECRET)
  headers.set('X-Site-Host', url.host)
  headers.set('X-Client-IP', request.headers.get('CF-Connecting-IP') ?? '')
  headers.set('X-Client-Country', request.headers.get('CF-IPCountry') ?? '')

  return fetch(new URL(url.pathname + url.search, env.API_ORIGIN), {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? null : request.body,
    // Redirects (Google sign-in) go back to the browser as they are.
    redirect: 'manual',
  })
}
