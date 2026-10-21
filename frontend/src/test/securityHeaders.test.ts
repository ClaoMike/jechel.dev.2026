import { describe, expect, it } from 'vitest'
import headers from '../../public/_headers?raw'

/** The headers Cloudflare Pages sends with every page (public/_headers). */
function header(name: string): string {
  const line = headers.split('\n').find((l) => l.trim().toLowerCase().startsWith(`${name.toLowerCase()}:`))
  return line?.split(/:(.*)/s)[1].trim() ?? ''
}

const csp = () => Object.fromEntries(header('Content-Security-Policy').split(';').map((d) => {
  const [name, ...values] = d.trim().split(/\s+/)
  return [name, values]
}))

describe('the security headers (public/_headers)', () => {
  it('apply to every path', () => {
    expect(headers.split('\n').some((l) => l.trim() === '/*')).toBe(true)
  })

  it("only run the site's own scripts (and Cal.com's embed): no inline or injected ones", () => {
    expect(csp()['script-src']).toEqual(["'self'", 'https://app.cal.com'])
    expect(csp()['default-src']).toEqual(["'self'"])
    expect(csp()['object-src']).toEqual(["'none'"])
    expect(csp()['base-uri']).toEqual(["'self'"])
    expect(header('Content-Security-Policy')).not.toContain('unsafe-eval')
  })

  it('only frame YouTube and Cal.com, and are never framed themselves', () => {
    expect(csp()['frame-src']).toEqual(['https://www.youtube-nocookie.com', 'https://app.cal.com', 'https://cal.com'])
    expect(csp()['frame-ancestors']).toEqual(["'none'"])
    expect(header('X-Frame-Options')).toBe('DENY')
  })

  it('only send forms and requests to the site (and Cal.com)', () => {
    expect(csp()['form-action']).toEqual(["'self'"])
    expect(csp()['connect-src']).toEqual(["'self'", 'https://app.cal.com'])
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
