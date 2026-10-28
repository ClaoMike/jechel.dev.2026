import { useState, type FormEvent } from 'react'
import { TextField } from '../../../components/fields'
import { PencilIcon } from '../../../components/icons/icons'
import { Loading, Skeleton } from '../../../components/Skeleton'
import { CurrencyPicker } from '../CurrencyPicker/CurrencyPicker'
import { PRICE } from '../workWithMe'
import { useAuth } from '../../../auth'
import { failureOf } from '../../../services/api'
import { useGetWorkWithMePriceQuery, useSaveWorkWithMePriceMutation } from '../../../store/api/workWithMeApi'
import { fieldErrorsOf } from '../../../utils/saveErrors'
import { formatPrice } from '../currencies'

const MAX_AMOUNT = 100_000

type Editing = { currency: string; amount: string; error: string | null; message: string | null }

/** The amount as typed ("25", "30.5", "30,50"), or why it can't be a price. */
function parseAmount(text: string): { amount: number } | { error: string } {
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

/** The hourly price (the API's: €25 until the admin sets one). The signed-in admin can change its currency and amount; visitors only read it. */
export function WorkWithMePrice() {
  // The hourly price everyone sees, and the admin's draft of it (a currency and an amount): saving shows it to
  // everyone.
  const { isAuthenticated } = useAuth()
  const query = useGetWorkWithMePriceQuery()
  const [savePrice, { isLoading: saving }] = useSaveWorkWithMePriceMutation()
  const [draft, setDraft] = useState<Editing | null>(null)
  const price = query.data

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || saving) return
    const parsed = parseAmount(draft.amount)
    if ('error' in parsed) return setDraft({ ...draft, error: parsed.error, message: null })
    setDraft({ ...draft, error: null, message: null })
    try {
      await savePrice({ currency: draft.currency, amount: parsed.amount }).unwrap()
      setDraft(null)
    } catch (error) {
      setDraft((current) => current && { ...current, message: describeError(error) })
    }
  }
  const shown = price ? formatPrice(price.currency, price.amount) : null
  const failed = query.isError && !price
  const canEdit = isAuthenticated && !!price
  // Only the signed-in admin edits.
  const editing = isAuthenticated ? draft : null
  const edit = () => price && setDraft({ currency: price.currency, amount: String(price.amount), error: null, message: null })
  const chooseCurrency = (currency: string) => setDraft((current) => current && { ...current, currency })
  const typeAmount = (amount: string) => setDraft((current) => current && { ...current, amount, error: null })
  const cancel = () => setDraft(null)

  return (
    <section aria-labelledby="work-price-title" className="work-price">
      <div className="work-price-header">
        <h4 id="work-price-title">Price</h4>
        {canEdit && !editing && (
          <button type="button" className="button button-secondary button-small" onClick={edit}>
            <PencilIcon size={16} />
            Edit <span className="visually-hidden">the price</span>
          </button>
        )}
      </div>

      {editing ? (
        <form className="work-price-editor" noValidate onSubmit={(event) => void save(event)} aria-label="Edit the price">
          <div className="work-price-fields">
            <CurrencyPicker label="Currency" value={editing.currency} onChange={chooseCurrency} />
            <TextField label={`Amount, ${PRICE.per}`} value={editing.amount} onChange={typeAmount} error={editing.error ?? undefined} />
          </div>
          {editing.message && (
            <p role="alert" className="form-error">
              {editing.message}
            </p>
          )}
          <div className="about-editor-actions">
            <button type="submit" className="button" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="button button-secondary" disabled={saving} onClick={cancel}>
              Cancel
            </button>
          </div>
        </form>
      ) : shown ? (
        <p>
          <span className="work-price-amount">{shown}</span> {PRICE.per}
        </p>
      ) : failed ? (
        <p className="muted">The price couldn't be loaded.</p>
      ) : (
        <Loading label="Loading the price…">
          <Skeleton width={140} height={28} />
        </Loading>
      )}
      <p className="muted">{PRICE.note}</p>
    </section>
  )
}
