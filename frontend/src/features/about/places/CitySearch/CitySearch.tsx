import { useEffect, useId, useState } from 'react'
import { SearchIcon } from '../../../../components/icons/icons'
import type { City } from '../../../../services/api'
import { useSearchCitiesQuery } from '../../../../store/api/aboutApi'
import { CityResults } from '../CityResults/CityResults'
import { placeLabel } from '../placeLabel'
import { strings } from '../../../../strings'

/** Waits until typing pauses, so each key press doesn't send a request. */
const SEARCH_DELAY_MS = 250

/** Type a city's name (2 letters or more); pick one of the matches (largest first) to place it on the map. */
export function CitySearch({ onPick }: { onPick: (city: City) => void }) {
  const id = useId()
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

  return (
    <div className="city-search">
      <div className="field">
        <label htmlFor={id}>{strings.citySearch.addCity}</label>
        <div className="city-search-input">
          <SearchIcon size={16} />
          <input
            id={id}
            type="search"
            value={query}
            placeholder={strings.citySearch.manchesterManchesterEngland}
            autoComplete="off"
            aria-describedby={`${id}-hint`}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          />
        </div>
        <p className="field-hint" id={`${id}-hint`}>
          <span>
            {strings.citySearch.anyPlace1000}{' '}
            <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">
              {strings.citySearch.geonames}
            </a>
            .
          </span>
        </p>
      </div>
      {active && search.isFetching && <p className="muted city-search-status">{strings.citySearch.searching}</p>}
      {active && search.isError && !search.isFetching && <p className="field-error">{strings.citySearch.searchIsntWorkingRight}</p>}
      {results && (
        <CityResults
          results={results.map((city) => ({
            key: city.id,
            city,
            label: placeLabel(city),
            name: city.name,
            detail: [city.region !== city.name ? city.region : '', city.country].filter(Boolean).join(', '),
          }))}
          onPick={(city) => {
            onPick(city)
            setQuery('')
          }}
        />
      )}
    </div>
  )
}
