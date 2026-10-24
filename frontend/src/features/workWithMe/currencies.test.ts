import { describe, expect, it } from 'vitest'
import { flagUrl } from '../about/flags'
import { CURRENCIES, currencyOf, FAVOURITE_CURRENCIES, formatPrice } from './currencies'

describe('the currencies', () => {
  it('start with the favourites, EUR, RON and GBP, each code once', () => {
    expect(FAVOURITE_CURRENCIES.map((c) => c.code)).toEqual(['EUR', 'RON', 'GBP'])
    expect(CURRENCIES.slice(0, 3)).toEqual(FAVOURITE_CURRENCIES)
    expect(new Set(CURRENCIES.map((c) => c.code)).size).toBe(CURRENCIES.length)
  })

  it("are then the other EU currencies, as the API's (WorkWithMePrices.Currencies), in its order", () => {
    expect(CURRENCIES.map((c) => c.code)).toEqual(['EUR', 'RON', 'GBP', 'CZK', 'DKK', 'HUF', 'PLN', 'SEK'])
  })

  it('each has a flag (the EU for the euro)', () => {
    expect(CURRENCIES.map((c) => c.flag)).toEqual(['EU', 'RO', 'GB', 'CZ', 'DK', 'HU', 'PL', 'SE'])
    for (const currency of CURRENCIES) expect(flagUrl(currency.flag)).toBeDefined()
  })

  it('writes one not on the list as its code', () => {
    expect(currencyOf('XYZ')).toEqual({ code: 'XYZ', name: 'XYZ', symbol: 'XYZ', after: true, flag: '' })
  })
})

describe('a price, written out', () => {
  it.each([
    ['EUR', 25, '€25'],
    ['GBP', 30.5, '£30.50'],
    ['RON', 120, '120 lei'],
    ['HUF', 1234.56, '1,234.56 Ft'],
    ['PLN', 99.9, '99.90 zł'],
    ['XYZ', 5, '5 XYZ'],
  ])('%s %d is %s', (code, amount, written) => {
    expect(formatPrice(code, amount)).toBe(written)
  })
})
