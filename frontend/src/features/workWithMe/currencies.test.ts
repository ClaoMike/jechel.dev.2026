import { describe, expect, it } from 'vitest'
import { CURRENCIES, currencyOf, FAVOURITE_CURRENCIES, formatPrice } from './currencies'

describe('the currencies', () => {
  it('start with the favourites, EUR, RON and GBP, each code once', () => {
    expect(FAVOURITE_CURRENCIES.map((c) => c.code)).toEqual(['EUR', 'RON', 'GBP'])
    expect(CURRENCIES.slice(0, 3)).toEqual(FAVOURITE_CURRENCIES)
    expect(new Set(CURRENCIES.map((c) => c.code)).size).toBe(CURRENCIES.length)
  })

  it("are the API's (WorkWithMePrices.Currencies), in its order", () => {
    expect(CURRENCIES.map((c) => c.code)).toEqual(['EUR', 'RON', 'GBP', 'USD', 'CHF', 'PLN', 'HUF', 'CZK', 'SEK', 'NOK', 'DKK', 'CAD', 'AUD'])
  })

  it('writes one not on the list as its code', () => {
    expect(currencyOf('XYZ')).toEqual({ code: 'XYZ', name: 'XYZ', symbol: 'XYZ', after: true })
  })
})

describe('a price, written out', () => {
  it.each([
    ['EUR', 25, '€25'],
    ['GBP', 30.5, '£30.50'],
    ['RON', 120, '120 lei'],
    ['USD', 1234.56, '$1,234.56'],
    ['CHF', 99.9, '99.90 CHF'],
    ['XYZ', 5, '5 XYZ'],
  ])('%s %d is %s', (code, amount, written) => {
    expect(formatPrice(code, amount)).toBe(written)
  })
})
