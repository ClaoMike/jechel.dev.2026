import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { CURRENCIES, currencyOf } from '../currencies'

/**
 * A select-only combobox (WAI-ARIA's pattern): focus stays on the button, the highlighted currency is its
 * aria-activedescendant. Closed, the arrows, Enter and Space open it on the chosen one; open, the arrows,
 * Home and End move, a letter jumps to the next code starting with it, Enter, Space or Tab pick, Escape closes.
 */
export function useCurrencyPickerViewModel(value: string, onChange: (code: string) => void) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  // Set by the keyboard (and opening): the mouse only highlights what it's already over, so the list mustn't move under it.
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

  return {
    root,
    open,
    current: currencyOf(value),
    listId: `${id}-list`,
    labelId: `${id}-label`,
    activeId: open ? optionId(active) : undefined,
    optionId,
    isActive: (index: number) => index === active,
    isChosen: (index: number) => index === chosen,
    toggle: () => (open ? setOpen(false) : show()),
    highlight: setActive,
    pick,
    onKeyDown,
    // Space's own click comes when it's let go (Firefox, Safari): the key already opened or picked.
    onKeyUp: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === ' ') event.preventDefault()
    },
  }
}
