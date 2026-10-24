import { useState, type FormEvent } from 'react'
import { useAuth } from '../../../auth'
import { failureOf } from '../../../services/api'
import { useGetWorkWithMePriceQuery, useSaveWorkWithMePriceMutation } from '../../../store/api/workWithMeApi'
import { fieldErrorsOf } from '../../../utils/saveErrors'
import { formatPrice } from '../currencies'

export const MAX_AMOUNT = 100_000

type Editing = { currency: string; amount: string; error: string | null; message: string | null }

/** The amount as typed ("25", "30.5", "30,50"), or why it can't be a price. */
export function parseAmount(text: string): { amount: number } | { error: string } {
  const typed = text.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(typed)) return { error: 'Give an amount like 25 or 30.50 (at most two decimals).' }
  const amount = Number(typed)
  if (amount <= 0 || amount > MAX_AMOUNT) return { error: `Give an amount more than 0 and at most ${MAX_AMOUNT.toLocaleString('en-GB')}.` }
  return { amount }
}

function describeError(error: unknown): string {
  const fields = fieldErrorsOf(error)
  if (fields) return Object.values(fields).flat()[0] ?? "Couldn't save. Please try again."
  if (failureOf(error).status === 401) return 'Your session has ended. Sign in again, then save.'
  return "Couldn't save. Please try again."
}

/** The hourly price everyone sees, and the admin's draft of it (a currency and an amount): saving shows it to everyone. */
export function useWorkWithMePriceViewModel() {
  const { isAuthenticated } = useAuth()
  const query = useGetWorkWithMePriceQuery()
  const [savePrice, { isLoading: saving }] = useSaveWorkWithMePriceMutation()
  const [editing, setEditing] = useState<Editing | null>(null)
  const price = query.data

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || saving) return
    const parsed = parseAmount(editing.amount)
    if ('error' in parsed) return setEditing({ ...editing, error: parsed.error, message: null })
    setEditing({ ...editing, error: null, message: null })
    try {
      await savePrice({ currency: editing.currency, amount: parsed.amount }).unwrap()
      setEditing(null)
    } catch (error) {
      setEditing((current) => current && { ...current, message: describeError(error) })
    }
  }

  return {
    shown: price ? formatPrice(price.currency, price.amount) : null,
    failed: query.isError && !price,
    canEdit: isAuthenticated && !!price,
    editing: isAuthenticated ? editing : null,
    saving,
    edit: () => price && setEditing({ currency: price.currency, amount: String(price.amount), error: null, message: null }),
    chooseCurrency: (currency: string) => setEditing((current) => current && { ...current, currency }),
    typeAmount: (amount: string) => setEditing((current) => current && { ...current, amount, error: null }),
    cancel: () => setEditing(null),
    save: (event: FormEvent<HTMLFormElement>) => void save(event),
  }
}
