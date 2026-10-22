import { describe, expect, it, vi } from 'vitest'
import { APPS, CATEGORIES, pageOf } from '../test/fixtures/apps'
import { fakeHttp } from '../test/http'
import { api, ApiError, type AppRequest } from './api'

const REQUEST: AppRequest = { title: 'Lighthouse', description: 'A game.', categoryIds: [3], platforms: ['iOS'], links: [{ label: 'App Store', url: 'https://apps.apple.com/x' }], media: [], showInWhatsNew: false }

// The real requests, below them only a fake network (test/http.ts).
describe('api.apps', () => {
  it('lists a page of apps', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: pageOf(APPS) }))

    expect(await api.apps.list(2, 8)).toEqual(pageOf(APPS))
    expect(await api.apps.list()).toEqual(pageOf(APPS))
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/apps?page=2&pageSize=8', 'GET /api/apps?page=1&pageSize=9'])
  })

  it('adds an app with a POST of the whole app, and changes one with a PUT', async () => {
    const { requests } = fakeHttp((r) => ({ status: r.method === 'POST' ? 201 : 200, body: { ...APPS[0], id: 7 } }))

    expect((await api.apps.create(REQUEST)).id).toBe(7)
    await api.apps.update(7, REQUEST)

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['POST /api/apps', 'PUT /api/apps/7'])
    expect(requests[0].body).toEqual(REQUEST)
    expect(requests[1].body).toEqual(REQUEST)
  })

  it('rejects with the field errors the API gives', async () => {
    fakeHttp(() => ({ status: 400, body: { title: 'One or more validation errors occurred.', errors: { 'media[0].url': ['Must be a YouTube video link.'], title: ['Required.'] } } }))

    const error = (await api.apps.create(REQUEST).catch((e: unknown) => e)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.validationErrors).toEqual({ 'media[0].url': ['Must be a YouTube video link.'], title: ['Required.'] })
  })

  it('deletes an app', async () => {
    const { requests } = fakeHttp(() => ({ status: 204 }))

    await api.apps.delete(7)

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['DELETE /api/apps/7'])
  })

  it("lists the categories, and saves the admin's whole list", async () => {
    const { requests } = fakeHttp((r) => ({ status: 200, body: r.method === 'GET' ? CATEGORIES : [{ id: 1, name: 'Phone app' }] }))

    expect(await api.apps.listCategories()).toEqual(CATEGORIES)
    expect(await api.apps.saveCategories([{ id: 1, name: 'Phone app' }, { id: null, name: 'Desktop app' }])).toEqual([{ id: 1, name: 'Phone app' }])

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/apps/categories', 'PUT /api/apps/categories'])
    expect(requests[1].body).toEqual([{ id: 1, name: 'Phone app' }, { id: null, name: 'Desktop app' }])
  })
  it("lists the admin's order of the apps, and saves it with which apps What's new? may show", async () => {
    const order = [
      { id: 2, title: 'Pocket Planner', showInWhatsNew: false },
      { id: 1, title: 'LIGHTHOUSE', showInWhatsNew: true },
    ]
    const { requests } = fakeHttp(() => ({ status: 200, body: order }))

    expect(await api.apps.listOrder()).toEqual(order)
    expect(await api.apps.saveOrder(order.map(({ id, showInWhatsNew }) => ({ id, showInWhatsNew })))).toEqual(order)

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/apps/order', 'PUT /api/apps/order'])
    expect(requests[1].body).toEqual([
      { id: 2, showInWhatsNew: false },
      { id: 1, showInWhatsNew: true },
    ])
  })

  it("gets the app What's new? may show, or null when there's none", async () => {
    let answered = 0
    const { requests } = fakeHttp(() => ({ status: 200, body: { app: answered++ === 0 ? APPS[1] : null } }))

    expect(await api.apps.whatsNew()).toEqual(APPS[1])
    expect(await api.apps.whatsNew()).toBeNull()
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/apps/whats-new', 'GET /api/apps/whats-new'])
  })
})

describe('api.files', () => {
  const file = (name: string, type: string) => new File(['bytes'], name, { type })

  it('uploads an app image or video as a form with the file, reporting how far it got', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: { url: '/api/files/1/clip.mp4', fileName: 'clip.mp4', kind: 'video' }, uploadProgress: [[25, 100], [100, 100]] }))
    const progress = vi.fn()

    const uploaded = await api.files.uploadAppMedia(file('clip.mp4', 'video/mp4'), progress)

    expect(uploaded).toEqual({ url: '/api/files/1/clip.mp4', fileName: 'clip.mp4', kind: 'video' })
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['POST /api/files/app-media'])
    const form = requests[0].body as FormData
    expect((form.get('file') as File).name).toBe('clip.mp4')
    expect(progress.mock.calls.map(([fraction]) => fraction)).toEqual([0.25, 1])
  })

  it('uploads a photo and a paper to their own addresses, with or without progress', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: { url: '/api/files/2/x', fileName: 'x' }, uploadProgress: [[1, 2]] }))

    await api.files.uploadPhoto(file('me.png', 'image/png'))
    await api.files.uploadPaper(file('paper.pdf', 'application/pdf'), vi.fn())

    expect(requests.map((r) => r.url)).toEqual(['/api/files/photo', '/api/files/paper'])
  })

  it('rejects with the reason the API gives for a file it refuses', async () => {
    fakeHttp(() => ({ status: 400, body: { errors: { file: ['Images must be at most 15 MB.'] } } }))

    const error = (await api.files.uploadAppMedia(file('big.png', 'image/png')).catch((e: unknown) => e)) as ApiError

    expect(error.validationErrors).toEqual({ file: ['Images must be at most 15 MB.'] })
  })
})
