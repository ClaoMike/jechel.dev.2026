import { CheckIcon, ChevronDownIcon, StarIcon } from '../../../components/icons/icons'
import { Flag } from '../../about/Flag'
import { CURRENCIES, FAVOURITE_CURRENCIES, OTHER_CURRENCIES, type Currency } from '../currencies'
import { useCurrencyPickerViewModel } from './CurrencyPicker.viewModel'

/** A currency's icon: the flag of where it's used. Decorative: the code and name beside it say which it is. */
function CurrencyFlag({ currency }: { currency: Currency }) {
  return (
    <span className="currency-flag" aria-hidden="true">
      <Flag code={currency.flag} />
    </span>
  )
}

/** A short dropdown of currencies, each with its flag: the favourites (EUR, RON, GBP) first, then the rest. */
export function CurrencyPicker({ label, value, onChange }: { label: string; value: string; onChange: (code: string) => void }) {
  const { root, ...vm } = useCurrencyPickerViewModel(value, onChange)

  const group = (title: string, currencies: readonly Currency[], favourite: boolean) => (
    <li role="presentation">
      <ul role="group" aria-label={title} className="currency-group">
        <li role="presentation" className="currency-group-title" aria-hidden="true">
          {favourite && <StarIcon size={12} />}
          {title}
        </li>
        {currencies.map((currency) => {
          const index = CURRENCIES.indexOf(currency)
          return (
            <li
              key={currency.code}
              id={vm.optionId(index)}
              role="option"
              aria-selected={vm.isChosen(index)}
              data-active={vm.isActive(index) || undefined}
              className="currency-option"
              onPointerMove={() => vm.highlight(index)}
              onClick={() => vm.pick(index)}
            >
              <CurrencyFlag currency={currency} />
              <span className="currency-code">{currency.code}</span>
              <span className="currency-name">{currency.name}</span>
              {vm.isChosen(index) && <CheckIcon size={16} />}
            </li>
          )
        })}
      </ul>
    </li>
  )

  return (
    <div className="field currency-picker" ref={root}>
      <span id={vm.labelId} className="field-label">
        {label}
      </span>
      <button
        type="button"
        role="combobox"
        className="currency-button"
        aria-labelledby={vm.labelId}
        aria-haspopup="listbox"
        aria-expanded={vm.open}
        aria-controls={vm.listId}
        aria-activedescendant={vm.activeId}
        onClick={vm.toggle}
        onKeyDown={vm.onKeyDown}
        onKeyUp={vm.onKeyUp}
      >
        <CurrencyFlag currency={vm.current} />
        <span className="currency-code">{vm.current.code}</span>
        <span className="currency-name">{vm.current.name}</span>
        <ChevronDownIcon size={16} />
      </button>
      <ul id={vm.listId} role="listbox" aria-labelledby={vm.labelId} className="currency-list" hidden={!vm.open}>
        {group('Favourites', FAVOURITE_CURRENCIES, true)}
        {group('Other currencies', OTHER_CURRENCIES, false)}
      </ul>
    </div>
  )
}
