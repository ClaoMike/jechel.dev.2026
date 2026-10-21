import { afterEach, describe, expect, it } from 'vitest'
import { fakeHttp } from '../test/http'
import { api, ApiError, failureOf, setRequestPreview } from './api'

// The plumbing under every endpoint (http.ts), through real api calls over a fake network.
describe('the API plumbing', () => {
  afterEach(() => setRequestPreview('normal'))

  it("reads a 400's field errors into the ApiError", async () => {
    fakeHttp(() => ({ status: 400, body: { title: 'One or more validation errors occurred.', errors: { email: ['Enter a valid email address.'] } } }))

    const error = (await api.contact.send({ name: 'Ana', email: 'nope', message: 'Hi' }).catch((e: unknown) => e)) as ApiError

    expect(error.status).toBe(400)
    expect(error.validationErrors).toEqual({ email: ['Enter a valid email address.'] })
  })

  it('has no field errors when the body has none, or none usable', async () => {
    for (const body of [{ title: 'Bad request' }, { errors: null }, 'plain text', undefined]) {
      fakeHttp(() => ({ status: 400, body }))
      const error = (await api.contact.send({ name: 'Ana', email: 'a@b.c', message: 'Hi' }).catch((e: unknown) => e)) as ApiError
      expect(error.validationErrors).toBeNull()
    }
  })

  it('leaves signing in alone in preview: the session is still checked', async () => {
    const { requests } = fakeHttp(() => ({ status: 401 }))
    setRequestPreview('error')

    expect(await api.auth.me()).toBeNull()
    expect(requests.map((r) => r.url)).toEqual(['/api/auth/me'])
  })

  it('lets a request held by the "loading" preview go when its signal aborts', async () => {
    fakeHttp(() => ({ status: 200, body: { items: [], page: 1, pageSize: 9, totalCount: 0 } }))
    setRequestPreview('loading')
    const controller = new AbortController()

    const held = api.youtube.listVideos(1, 9, controller.signal).catch((e: unknown) => e)
    controller.abort()

    expect(((await held) as Error).name).toBe('CanceledError')
  })

  describe('failureOf', () => {
    it('reads an ApiError', () => {
      expect(failureOf(new ApiError('/api/x', 400, { name: ['Required'] }))).toEqual({ status: 400, validationErrors: { name: ['Required'] } })
    })

    it('reads a failure the store kept as plain data', () => {
      expect(failureOf({ status: 503 })).toEqual({ status: 503, validationErrors: null })
      expect(failureOf({ status: 400, validationErrors: { email: ['Bad'] } })).toEqual({ status: 400, validationErrors: { email: ['Bad'] } })
    })

    it('reads anything else as no HTTP status', () => {
      for (const error of [new Error('boom'), 'boom', null, undefined, { status: '500' }]) {
        expect(failureOf(error)).toEqual({ status: 0, validationErrors: null })
      }
    })
  })
})
