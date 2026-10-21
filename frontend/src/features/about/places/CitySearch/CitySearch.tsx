import { SearchIcon } from '../../../../components/icons/icons'
import { CityResults } from '../CityResults/CityResults'
import type { City } from '../../../../services/api'
import { useCitySearchViewModel } from './CitySearch.viewModel'

/** Type a city's name; pick one of the matches (largest first) to place it on the map. */
export function CitySearch({ onPick }: { onPick: (city: City) => void }) {
  const vm = useCitySearchViewModel(onPick)

  return (
    <div className="city-search">
      <div className="field">
        <label htmlFor={vm.id}>Add a city</label>
        <div className="city-search-input">
          <SearchIcon size={16} />
          <input
            id={vm.id}
            type="search"
            value={vm.query}
            placeholder="Manchester, or Manchester, England"
            autoComplete="off"
            aria-describedby={`${vm.id}-hint`}
            onChange={(e) => vm.setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          />
        </div>
        <p className="field-hint" id={`${vm.id}-hint`}>
          <span>
            Any place with 1,000+ people. City data:{' '}
            <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">
              GeoNames
            </a>
            .
          </span>
        </p>
      </div>
      {vm.searching && <p className="muted city-search-status">Searching…</p>}
      {vm.failed && <p className="field-error">The search isn't working right now. Please try again.</p>}
      {vm.results && <CityResults results={vm.results} onPick={vm.pick} />}
    </div>
  )
}
