/** What the stand-in services (fakeServices.ts) know, shared with the tests that check it on the site. */

/** Who can sign in at the stand-in for Google: the admin (Auth:AdminEmails) and someone who isn't. */
export const ACCOUNTS = {
  admin: { sub: '110000000000000000001', email: 'admin@e2e.test', email_verified: true, name: 'E2E Admin' },
  stranger: { sub: '110000000000000000002', email: 'stranger@e2e.test', email_verified: true, name: 'A Stranger' },
} as const

/** The YouTube channel: 12 videos, so its page has two pages of 9. Newest first. */
export const VIDEOS = Array.from({ length: 12 }, (_, i) => {
  const n = 12 - i
  return {
    id: `video${String(n).padStart(6, '0')}`,
    title: `E2E video ${n}`,
    description: `What happens in video ${n}.`,
    publishedAt: new Date(Date.UTC(2026, 0, n, 12)).toISOString(),
  }
})

/** The apps the setup adds, which every browser sees: 10, so the visitors' page (9 a page) has a second one. Newest last. */
export const APPS = Array.from({ length: 10 }, (_, i) => `E2E app ${i + 1}`)
