import { useEffect, useId, useState } from 'react'
import type { City } from '../../../../services/api'
import { useSearchCitiesQuery } from '../../../../store/api/aboutApi'
import { placeLabel } from '../placeLabel'

/** Waits until typing pauses, so each key press doesn't send a request. */
const SEARCH_DELAY_MS = 250

/** Cities whose name starts with what's typed (2 letters or more), largest first, from the store. */
export function useCitySearchViewModel(onPick: (city: City) => void) {
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState('')
  const text = query.trim()
  const active = text.length >= 2

  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => setSearched(text), SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [text, active])

  const search = useSearchCitiesQuery(searched, { skip: !active || searched.length < 2 })
  const results = active && searched === text && !search.isFetching && !search.isError ? (search.currentData ?? null) : null

  return {
    id: useId(),
    query,
    setQuery,
    searching: active && search.isFetching,
    failed: active && search.isError && !search.isFetching,
    results: results?.map((city) => ({ key: city.id, city, label: placeLabel(city), name: city.name, detail: [city.region !== city.name ? city.region : '', city.country].filter(Boolean).join(', ') })) ?? null,
    pick: (city: City) => {
      onPick(city)
      setQuery('')
    },
  }
}
