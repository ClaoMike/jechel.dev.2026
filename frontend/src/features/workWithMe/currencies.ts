/** The currencies Work with me's price can be in (the API's WorkWithMePrices.Currencies lists the same codes). */

export interface Currency {
  /** ISO 4217. */
  code: string
  name: string
  /** As it's written next to an amount: €, lei, £. */
  symbol: string
  /** Written after the amount (25 lei), not before it (€25). */
  after?: boolean
}

/** At the top of the list. */
export const FAVOURITE_CURRENCIES: readonly Currency[] = [
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'RON', name: 'Romanian leu', symbol: 'lei', after: true },
  { code: 'GBP', name: 'British pound', symbol: '£' },
]

/** The rest, after the favourites. */
export const OTHER_CURRENCIES: readonly Currency[] = [
  { code: 'USD', name: 'US dollar', symbol: '$' },
  { code: 'CHF', name: 'Swiss franc', symbol: 'CHF', after: true },
  { code: 'PLN', name: 'Polish złoty', symbol: 'zł', after: true },
  { code: 'HUF', name: 'Hungarian forint', symbol: 'Ft', after: true },
  { code: 'CZK', name: 'Czech koruna', symbol: 'Kč', after: true },
  { code: 'SEK', name: 'Swedish krona', symbol: 'kr', after: true },
  { code: 'NOK', name: 'Norwegian krone', symbol: 'kr', after: true },
  { code: 'DKK', name: 'Danish krone', symbol: 'kr', after: true },
  { code: 'CAD', name: 'Canadian dollar', symbol: 'C$' },
  { code: 'AUD', name: 'Australian dollar', symbol: 'A$' },
]

export const CURRENCIES: readonly Currency[] = [...FAVOURITE_CURRENCIES, ...OTHER_CURRENCIES]

/** The currency with that code; one not on the list is written as its code. */
export function currencyOf(code: string): Currency {
  return CURRENCIES.find((c) => c.code === code) ?? { code, name: code, symbol: code, after: true }
}

/** "€25", "25 lei", "£30.50": whole amounts without decimals, others with two. */
export function formatPrice(code: string, amount: number): string {
  const currency = currencyOf(code)
  const number = amount.toLocaleString('en-GB', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })
  return currency.after ? `${number} ${currency.symbol}` : `${currency.symbol}${number}`
}
