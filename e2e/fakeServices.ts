/**
 * Stand-ins for the services the site uses, for the end-to-end tests. The API (environment E2E, setting
 * E2E:Services) talks to these instead of the real ones, so nothing leaves this computer and the tests can
 * see what was sent:
 *  - Google sign-in (/google): a "choose an account" page, then back to the API, which swaps the code for the account.
 *    Stateless, so every browser can sign in at once: the account picked travels as the code, then as the token.
 *  - YouTube's Data API (/youtube): one channel with the videos in data.ts.
 *  - Resend (/resend): emails are kept, and listed at GET /sent/emails.
 *  - ntfy (/ntfy): phone alerts are kept, and listed at GET /sent/alerts.
 *  - A push service (/push/<device>), as Apple's or Google's for the site's own notifications: what's posted is kept,
 *    encrypted as it came, and listed at GET /sent/pushes; /push/gone answers 410, as for a device no longer there.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { ACCOUNTS, VIDEOS } from './data.ts'

const port = Number(process.env.FAKE_SERVICES_PORT ?? 5299)
const emails: unknown[] = []
const alerts: unknown[] = []
const pushes: { device: string; authorization: string; encoding: string; ttl: string; body: string }[] = []

const json = (response: ServerResponse, status: number, body: unknown) => response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))

async function bytesOf(request: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

async function bodyOf(request: IncomingMessage) {
  let body = ''
  for await (const chunk of request) body += chunk
  return body
}

/** A plain thumbnail, so no picture is fetched from YouTube. */
const thumbnail = (title: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#334"/><text x="240" y="190" font-size="32" fill="#fff" text-anchor="middle" font-family="sans-serif">${title}</text></svg>`

createServer((request, response) =>
  void handle(request, response).catch((error: unknown) => {
    if (!response.headersSent) json(response, 400, { message: String(error) })
  }),
).listen(port, () => console.log(`Fake services on http://localhost:${port}`))

async function handle(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? '/', `http://localhost:${port}`)
  const path = url.pathname

  // Google: the consent screen, one link per account, each straight back to the API with its code.
  if (path === '/google/auth') {
    const back = (params: Record<string, string>) => {
      const target = new URL(url.searchParams.get('redirect_uri')!)
      for (const [name, value] of Object.entries({ ...params, state: url.searchParams.get('state')! })) target.searchParams.set(name, value)
      return target.toString()
    }
    const links = Object.entries(ACCOUNTS)
      .map(([key, account]) => `<li><a href="${back({ code: key })}">${account.name} (${account.email})</a></li>`)
      .join('')
    const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Choose an account</title></head><body><h1>Choose an account</h1><ul>${links}</ul><a href="${back({ error: 'access_denied' })}">Cancel</a></body></html>`
    return void response.writeHead(200, { 'content-type': 'text/html' }).end(page)
  }
  if (path === '/google/token' && request.method === 'POST') {
    const code = new URLSearchParams(await bodyOf(request)).get('code') ?? ''
    if (!(code in ACCOUNTS)) return json(response, 400, { error: 'invalid_grant' })
    return json(response, 200, { access_token: code, token_type: 'Bearer', expires_in: 3600 })
  }
  if (path === '/google/userinfo') {
    const account = ACCOUNTS[(request.headers.authorization ?? '').replace(/^Bearer /, '') as keyof typeof ACCOUNTS]
    return account ? json(response, 200, account) : json(response, 401, {})
  }

  // YouTube: the channel, then its uploads (all on one page).
  if (path === '/youtube/channels') return json(response, 200, { items: [{ contentDetails: { relatedPlaylists: { uploads: 'UPLOADS' } } }] })
  if (path === '/youtube/playlistItems') {
    const items = VIDEOS.map((video) => ({
      status: { privacyStatus: 'public' },
      contentDetails: { videoPublishedAt: video.publishedAt },
      snippet: {
        title: video.title,
        description: video.description,
        resourceId: { videoId: video.id },
        thumbnails: { high: { url: `http://localhost:${port}/thumbnails/${video.id}.svg` } },
      },
    }))
    return json(response, 200, { items })
  }
  if (path.startsWith('/thumbnails/')) {
    const video = VIDEOS.find((v) => path === `/thumbnails/${v.id}.svg`)
    return void response.writeHead(video ? 200 : 404, { 'content-type': 'image/svg+xml' }).end(video ? thumbnail(video.title) : '')
  }

  // Resend and ntfy: kept for the tests to read.
  if (path === '/resend/emails' && request.method === 'POST') {
    emails.push(JSON.parse(await bodyOf(request)))
    return json(response, 200, { id: `email-${emails.length}` })
  }
  if (path === '/ntfy/' && request.method === 'POST') {
    alerts.push(JSON.parse(await bodyOf(request)))
    return json(response, 200, { id: `alert-${alerts.length}` })
  }
  if (path.startsWith('/push/') && request.method === 'POST') {
    const device = path.slice('/push/'.length)
    if (device === 'gone') return json(response, 410, {})
    const header = (name: string) => String(request.headers[name] ?? '')
    pushes.push({ device, authorization: header('authorization'), encoding: header('content-encoding'), ttl: header('ttl'), body: (await bytesOf(request)).toString('base64') })
    return void response.writeHead(201).end()
  }
  if (path === '/sent/pushes') return json(response, 200, pushes)
  if (path === '/sent/emails') return json(response, 200, emails)
  if (path === '/sent/alerts') return json(response, 200, alerts)

  if (path === '/health') return void response.writeHead(200).end('ok')
  json(response, 404, { message: `Not faked: ${request.method} ${path}` })
}
