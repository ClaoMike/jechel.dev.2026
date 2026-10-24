import { TextField } from '../../../components/fields'
import { PencilIcon } from '../../../components/icons/icons'
import { Loading, Skeleton } from '../../../components/Skeleton'
import { CurrencyPicker } from '../CurrencyPicker/CurrencyPicker'
import { PRICE } from '../workWithMe'
import { useWorkWithMePriceViewModel } from './WorkWithMePrice.viewModel'

/** The hourly price (the API's: €25 until the admin sets one). The signed-in admin can change its currency and amount; visitors only read it. */
export function WorkWithMePrice() {
  const vm = useWorkWithMePriceViewModel()
  const { editing } = vm

  return (
    <section aria-labelledby="work-price-title" className="work-price">
      <div className="work-price-header">
        <h4 id="work-price-title">Price</h4>
        {vm.canEdit && !editing && (
          <button type="button" className="button button-secondary button-small" onClick={vm.edit}>
            <PencilIcon size={16} />
            Edit <span className="visually-hidden">the price</span>
          </button>
        )}
      </div>

      {editing ? (
        <form className="work-price-editor" noValidate onSubmit={vm.save} aria-label="Edit the price">
          <div className="work-price-fields">
            <CurrencyPicker label="Currency" value={editing.currency} onChange={vm.chooseCurrency} />
            <TextField label={`Amount, ${PRICE.per}`} value={editing.amount} onChange={vm.typeAmount} error={editing.error ?? undefined} />
          </div>
          {editing.message && (
            <p role="alert" className="form-error">
              {editing.message}
            </p>
          )}
          <div className="about-editor-actions">
            <button type="submit" className="button" disabled={vm.saving}>
              {vm.saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="button button-secondary" disabled={vm.saving} onClick={vm.cancel}>
              Cancel
            </button>
          </div>
        </form>
      ) : vm.shown ? (
        <p>
          <span className="work-price-amount">{vm.shown}</span> {PRICE.per}
        </p>
      ) : vm.failed ? (
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
