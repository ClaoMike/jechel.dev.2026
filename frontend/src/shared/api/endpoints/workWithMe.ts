/** Work with me: the hourly price. */

import { get, http } from '../http'

/** An hour's price: a currency (ISO 4217, one of features/work-with-me/lib/currencies.ts) and an amount in it. */
export interface WorkWithMePrice {
  currency: string
  amount: number
}

export const workWithMeEndpoints = {
  /** Public. €25 until the admin first saves a price. */
  getPrice(signal?: AbortSignal): Promise<WorkWithMePrice> {
    return get<WorkWithMePrice>('/api/work-with-me/price', { signal })
  },

  /** Admin only. Rejects with a 400 ApiError (its field errors: currency, amount) when it can't be saved. */
  async savePrice(price: WorkWithMePrice): Promise<WorkWithMePrice> {
    const response = await http.put<WorkWithMePrice>('/api/work-with-me/price', price)
    return response.data
  },
}
