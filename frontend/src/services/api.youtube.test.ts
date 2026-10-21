import { afterEach, describe, expect, it } from 'vitest'
import { pageOfVideos, VIDEOS } from '../test/fixtures/site'
import { fakeHttp } from '../test/http'
import { api, ApiError, onRequestFailed, setRequestPreview, type FailedRequest } from './api'

// The real request, below it only a fake network (test/http.ts).
describe('api.youtube.listVideos', () => {
  afterEach(() => setRequestPreview('normal'))

  it('asks for a page of videos and gives back what the API answered', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: pageOfVideos(VIDEOS, 2, 3, 11) }))

    const result = await api.youtube.listVideos(2, 3)

    expect(result).toEqual(pageOfVideos(VIDEOS, 2, 3, 11))
    expect(requests).toHaveLength(1)
    expect(requests[0].method).toBe('GET')
    expect(requests[0].url).toBe('/api/youtube/videos?page=2&pageSize=3')
    expect(requests[0].headers.Accept).toBe('application/json')
  })

  it('asks for the first nine by default', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: pageOfVideos() }))

    await api.youtube.listVideos()

    expect(requests[0].url).toBe('/api/youtube/videos?page=1&pageSize=9')
  })

  it('rejects with an ApiError when YouTube is not set up or unreachable (503), and tells the failure listeners', async () => {
    fakeHttp(() => ({ status: 503, body: { title: 'Service Unavailable', detail: "YouTube can't be reached right now." } }))
    const failed: FailedRequest[] = []
    const stop = onRequestFailed((request) => failed.push(request))

    try {
      const error = await api.youtube.listVideos().catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(503)
      expect((error as ApiError).validationErrors).toBeNull()
      expect(failed).toEqual([{ method: 'GET', path: '/api/youtube/videos', status: 503 }])
    } finally {
      stop()
    }
  })

  it('rejects with status 0 when no answer arrives at all', async () => {
    fakeHttp(() => 'network-error')

    const error = await api.youtube.listVideos().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(0)
  })

  it('stops when the signal aborts, as a cancellation (not an ApiError)', async () => {
    fakeHttp(() => 'never')
    const controller = new AbortController()

    const request = api.youtube.listVideos(1, 9, controller.signal).catch((e: unknown) => e)
    controller.abort()
    const error = await request

    expect(error).not.toBeInstanceOf(ApiError)
    expect((error as Error).name).toBe('CanceledError')
  })

  it("follows the admin's preview switch: fails with a 500, or keeps loading until it's switched back", async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: pageOfVideos() }))

    setRequestPreview('error')
    const error = await api.youtube.listVideos().catch((e: unknown) => e)
    expect((error as ApiError).status).toBe(500)

    setRequestPreview('loading')
    const held = api.youtube.listVideos().catch((e: unknown) => e)
    setRequestPreview('normal')
    expect((await held as Error).name).toBe('CanceledError')

    expect(requests).toHaveLength(0)
  })
})

describe('api.youtube.refreshVideos', () => {
  it('posts to the refresh endpoint and gives back how many videos there are', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: { count: 12 } }))

    expect(await api.youtube.refreshVideos()).toBe(12)
    expect(requests).toHaveLength(1)
    expect(requests[0].method).toBe('POST')
    expect(requests[0].url).toBe('/api/youtube/refresh')
  })

  it('rejects with an ApiError when YouTube cannot be reached (503) or the session ended (401)', async () => {
    for (const status of [503, 401]) {
      fakeHttp(() => ({ status, body: { title: 'Nope' } }))
      const error = await api.youtube.refreshVideos().catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(status)
    }
  })

  it('is never held or failed by the preview switch: it is not a GET', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: { count: 3 } }))
    setRequestPreview('error')
    try {
      expect(await api.youtube.refreshVideos()).toBe(3)
    } finally {
      setRequestPreview('normal')
    }
    expect(requests).toHaveLength(1)
  })
})
