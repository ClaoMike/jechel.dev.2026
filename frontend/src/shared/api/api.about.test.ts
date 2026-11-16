import { describe, expect, it } from 'vitest'
import { ABOUT } from '@/test/fixtures/about'
import { LEETCODE, RESUME } from '@/test/fixtures/site'
import { fakeHttp } from '@/test/http'
import { api, ApiError } from './api'

// The real requests behind About Me, its résumé, LeetCode stats and city search, over a fake network.
describe('api.about', () => {
  it('reads the page, and saves the whole page', async () => {
    const { requests } = fakeHttp((request) => ({ status: 200, body: request.method === 'GET' ? ABOUT : { ...ABOUT, photoUrl: '/stored.webp' } }))

    expect(await api.about.get()).toEqual(ABOUT)
    expect((await api.about.update(ABOUT)).photoUrl).toBe('/stored.webp')
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/about', 'PUT /api/about'])
    expect(requests[1].body).toEqual(ABOUT)
  })

  it("rejects a save with the fields' errors", async () => {
    fakeHttp(() => ({ status: 400, body: { errors: { 'experience[0].title': ['Required.'] } } }))

    const error = (await api.about.update(ABOUT).catch((e: unknown) => e)) as ApiError

    expect(error.status).toBe(400)
    expect(error.validationErrors).toEqual({ 'experience[0].title': ['Required.'] })
  })
})

describe('api.resume', () => {
  it('reads the public headline on its own', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: { headline: 'Full-stack engineer' } }))

    expect(await api.resume.getHeadline()).toBe('Full-stack engineer')
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/resume/headline'])
  })

  it('reads the settings and saves the contact, the choices, or generates', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: RESUME }))
    const contact = { phone: RESUME.phone, email: RESUME.email, headline: RESUME.headline }
    const choices = { sections: RESUME.sections, excludedSkills: ['COBOL'] }

    expect(await api.resume.getSettings()).toEqual(RESUME)
    expect(await api.resume.saveContact(contact)).toEqual(RESUME)
    await api.resume.saveChoices(choices)
    await api.resume.generate(choices)

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/resume/settings', 'PUT /api/resume/contact', 'PUT /api/resume/choices', 'POST /api/resume/generate'])
    expect(requests.slice(1).map((r) => r.body)).toEqual([contact, choices, choices])
  })

  it('links to the public and the private PDF', () => {
    expect(api.resume.publicUrl).toMatch(/\/api\/resume$/)
    expect(api.resume.privateUrl).toMatch(/\/api\/resume\/private$/)
  })
})

describe('api.leetcode', () => {
  it('reads the stats, or null when no username is set (204)', async () => {
    fakeHttp(() => ({ status: 200, body: LEETCODE }))
    expect(await api.leetcode.get()).toEqual(LEETCODE)

    fakeHttp(() => ({ status: 204 }))
    expect(await api.leetcode.get()).toBeNull()
  })

  it('rejects with 404 for an unknown user and 503 while LeetCode is down', async () => {
    for (const status of [404, 503]) {
      fakeHttp(() => ({ status }))
      expect(((await api.leetcode.get().catch((e: unknown) => e)) as ApiError).status).toBe(status)
    }
  })
})

describe('api.places', () => {
  it('searches cities by what is typed', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: [] }))

    expect(await api.places.searchCities('manchester, us')).toEqual([])
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/places/search?q=manchester,+us'])
  })
})

describe('api.youtube.channel', () => {
  it("reads my channel's page, or null when no channel is set (204)", async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: { url: 'https://www.youtube.com/@jechel' } }))
    expect(await api.youtube.channel()).toEqual({ url: 'https://www.youtube.com/@jechel' })
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/youtube/channel'])

    fakeHttp(() => ({ status: 204 }))
    expect(await api.youtube.channel()).toBeNull()
  })
})
