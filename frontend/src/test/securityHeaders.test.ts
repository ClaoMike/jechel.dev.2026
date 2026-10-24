import { describe, expect, it } from 'vitest'

// public/_headers as Vite serves it, at the root (an import of a file in public/ is refused or warned about).
const headers = await (await fetch('/_headers')).text()

/** The headers Cloudflare Pages sends with every page (public/_headers). */
function header(name: string): string {
  const line = headers.split('\n').find((l) => l.trim().toLowerCase().startsWith(`${name.toLowerCase()}:`))
  return line?.split(/:(.*)/s)[1].trim() ?? ''
}

const csp = () =>
  Object.fromEntries(
    header('Content-Security-Policy')
      .split(';')
      .map((d) => {
        const [name, ...values] = d.trim().split(/\s+/)
        return [name, values]
      }),
  )

describe('the security headers (public/_headers)', () => {
  it('apply to every path', () => {
    expect(headers.split('\n').some((l) => l.trim() === '/*')).toBe(true)
  })

  it("only run the site's own scripts: no inline or injected ones, and no one else's", () => {
    expect(csp()['script-src']).toEqual(["'self'"])
    expect(csp()['default-src']).toEqual(["'self'"])
    expect(csp()['object-src']).toEqual(["'none'"])
    expect(csp()['base-uri']).toEqual(["'self'"])
    expect(header('Content-Security-Policy')).not.toContain('unsafe-eval')
  })

  it('only frame YouTube, and are never framed themselves', () => {
    expect(csp()['frame-src']).toEqual(['https://www.youtube-nocookie.com'])
    expect(csp()['frame-ancestors']).toEqual(["'none'"])
    expect(header('X-Frame-Options')).toBe('DENY')
  })

  it('only send forms and requests to the site', () => {
    expect(csp()['form-action']).toEqual(["'self'"])
    expect(csp()['connect-src']).toEqual(["'self'"])
  })

  it('keep browsers on HTTPS and away from the camera, microphone and location', () => {
    expect(header('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains')
    expect(csp()['upgrade-insecure-requests']).toEqual([])
    expect(header('Permissions-Policy')).toContain('camera=()')
    expect(header('Permissions-Policy')).toContain('microphone=()')
    expect(header('Permissions-Policy')).toContain('geolocation=()')
    expect(header('X-Content-Type-Options')).toBe('nosniff')
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })
})
