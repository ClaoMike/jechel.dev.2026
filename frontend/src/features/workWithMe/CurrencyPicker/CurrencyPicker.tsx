import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { CheckIcon, ChevronDownIcon, StarIcon } from '../../../components/icons/icons'
import { Flag } from '../../about/Flag'
import { CURRENCIES, FAVOURITE_CURRENCIES, OTHER_CURRENCIES, type Currency, currencyOf } from '../currencies'

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
  // A select-only combobox (WAI-ARIA's pattern): focus stays on the button, the highlighted currency is its
  // aria-activedescendant. Closed, the arrows, Enter and Space open it on the chosen one; open, the arrows, Home and
  // End move, a letter jumps to the next code starting with it, Enter, Space or Tab pick, Escape closes.
  const id = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  // Set by the keyboard (and opening): the mouse only highlights what it's already over, so the list mustn't move under
  // it.
  const reveal = useRef(false)
  const chosen = Math.max(
    0,
    CURRENCIES.findIndex((c) => c.code === value),
  )
  const optionId = (index: number) => `${id}-option-${CURRENCIES[index].code}`

  // A click anywhere else closes it.
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  // The one the keyboard highlights stays in sight in the scrolling list.
  useEffect(() => {
    if (!open || !reveal.current) return
    reveal.current = false
    document.getElementById(`${id}-option-${CURRENCIES[active].code}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, id])

  function show(index = chosen) {
    reveal.current = true
    setActive(index)
    setOpen(true)
  }

  function pick(index: number) {
    onChange(CURRENCIES[index].code)
    setOpen(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const last = CURRENCIES.length - 1
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault()
        show()
      }
      return
    }
    const move = (index: number) => {
      event.preventDefault()
      reveal.current = true
      setActive(Math.min(last, Math.max(0, index)))
    }
    if (event.key === 'ArrowDown') move(active + 1)
    else if (event.key === 'ArrowUp') move(active - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(last)
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      pick(active)
    } else if (event.key === 'Tab') pick(active)
    else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    } else if (/^[a-z]$/i.test(event.key)) {
      // The next code after the highlighted one that starts with the letter, round to the first.
      const letter = event.key.toUpperCase()
      const order = [...CURRENCIES.keys()].map((i) => (active + 1 + i) % CURRENCIES.length)
      const next = order.find((i) => CURRENCIES[i].code.startsWith(letter))
      if (next !== undefined) move(next)
    }
  }
  const current = currencyOf(value)
  const listId = `${id}-list`
  const labelId = `${id}-label`
  const activeId = open ? optionId(active) : undefined
  const isActive = (index: number) => index === active
  const isChosen = (index: number) => index === chosen
  const toggle = () => (open ? setOpen(false) : show())
  // Space's own click comes when it's let go (Firefox, Safari): the key already opened or picked.
  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === ' ') event.preventDefault()
  }

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
              id={optionId(index)}
              role="option"
              aria-selected={isChosen(index)}
              data-active={isActive(index) || undefined}
              className="currency-option"
              onPointerMove={() => setActive(index)}
              onClick={() => pick(index)}
            >
              <CurrencyFlag currency={currency} />
              <span className="currency-code">{currency.code}</span>
              <span className="currency-name">{currency.name}</span>
              {isChosen(index) && <CheckIcon size={16} />}
            </li>
          )
        })}
      </ul>
    </li>
  )

  return (
    <div className="field currency-picker" ref={root}>
      <span id={labelId} className="field-label">
        {label}
      </span>
      <button
        type="button"
        role="combobox"
        className="currency-button"
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeId}
        onClick={toggle}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      >
        <CurrencyFlag currency={current} />
        <span className="currency-code">{current.code}</span>
        <span className="currency-name">{current.name}</span>
        <ChevronDownIcon size={16} />
      </button>
      <ul id={listId} role="listbox" aria-labelledby={labelId} className="currency-list" hidden={!open}>
        {group('Favourites', FAVOURITE_CURRENCIES, true)}
        {group('Other currencies', OTHER_CURRENCIES, false)}
      </ul>
    </div>
  )
}
