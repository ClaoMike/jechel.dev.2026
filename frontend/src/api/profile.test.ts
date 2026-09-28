import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API, server } from '../test/server'
import { getFirstName } from './profile'

describe('getFirstName', () => {
  it('returns the first name from the API', async () => {
    await expect(getFirstName()).resolves.toBe('Claudiu')
  })

  it('throws when the API responds with an error', async () => {
    server.use(http.get(`${API}/api/firstname`, () => new HttpResponse(null, { status: 404 })))

    await expect(getFirstName()).rejects.toThrow('status 404')
  })
})
