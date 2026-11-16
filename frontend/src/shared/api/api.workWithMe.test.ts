import { describe, expect, it } from 'vitest'
import { fakeHttp } from '@/test/http'
import { api, ApiError } from './api'

// The real requests behind Work with me's hourly price, over a fake network.
describe('api.workWithMe', () => {
  it('gets the price, and saves one with the answer as stored', async () => {
    const { requests } = fakeHttp(({ method, body }) => ({ status: 200, body: method === 'GET' ? { currency: 'EUR', amount: 25 } : body }))

    expect(await api.workWithMe.getPrice()).toEqual({ currency: 'EUR', amount: 25 })
    expect(await api.workWithMe.savePrice({ currency: 'GBP', amount: 40 })).toEqual({ currency: 'GBP', amount: 40 })

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/work-with-me/price', 'PUT /api/work-with-me/price'])
    expect(requests[1].body).toEqual({ currency: 'GBP', amount: 40 })
  })

  it("rejects a price the API won't take with its field errors", async () => {
    fakeHttp(() => ({ status: 400, body: { errors: { amount: ['Must be more than 0.'], currency: ['Choose a currency from the list.'] } } }))

    const error = (await api.workWithMe.savePrice({ currency: 'XXX', amount: 0 }).catch((e: unknown) => e)) as ApiError

    expect(error.status).toBe(400)
    expect(error.validationErrors).toEqual({ amount: ['Must be more than 0.'], currency: ['Choose a currency from the list.'] })
  })
})
