import { strings } from '../../strings'

/** The currencies Work with me's price can be in (the API's WorkWithMePrices.Currencies lists the same codes). */

export interface Currency {
  /** ISO 4217. */
  code: string
  name: string
  /** As it's written next to an amount: €, lei, £. */
  symbol: string
  /** Written after the amount (25 lei), not before it (€25). */
  after?: boolean
  /** Its icon: the flag of where it's used (the EU's for the euro), as About Me's citizenships show them. */
  flag: string
}

/** At the top of the list. */
export const FAVOURITE_CURRENCIES: readonly Currency[] = [
  { code: 'EUR', name: strings.currencies.euro, symbol: '€', flag: 'EU' },
  { code: 'RON', name: strings.currencies.romanianLeu, symbol: 'lei', after: true, flag: 'RO' },
  { code: 'GBP', name: strings.currencies.britishPound, symbol: '£', flag: 'GB' },
]

/** After the favourites: the other currencies of the EU's countries (those not on the euro). */
export const OTHER_CURRENCIES: readonly Currency[] = [
  { code: 'CZK', name: strings.currencies.czechKoruna, symbol: 'Kč', after: true, flag: 'CZ' },
  { code: 'DKK', name: strings.currencies.danishKrone, symbol: strings.currencies.kr, after: true, flag: 'DK' },
  { code: 'HUF', name: strings.currencies.hungarianForint, symbol: strings.currencies.ft, after: true, flag: 'HU' },
  { code: 'PLN', name: strings.currencies.polishZOty, symbol: 'zł', after: true, flag: 'PL' },
  { code: 'SEK', name: strings.currencies.swedishKrona, symbol: 'kr', after: true, flag: 'SE' },
]

export const CURRENCIES: readonly Currency[] = [...FAVOURITE_CURRENCIES, ...OTHER_CURRENCIES]

/** The currency with that code; one not on the list is written as its code. */
export function currencyOf(code: string): Currency {
  return CURRENCIES.find((c) => c.code === code) ?? { code, name: code, symbol: code, after: true, flag: '' }
}

/** "€25", "25 lei", "£30.50": whole amounts without decimals, others with two. */
export function formatPrice(code: string, amount: number): string {
  const currency = currencyOf(code)
  const number = amount.toLocaleString('en-GB', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })
  return currency.after ? `${number} ${currency.symbol}` : `${currency.symbol}${number}`
}
