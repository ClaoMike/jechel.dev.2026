import type { City } from '../../../../services/api'
import { strings } from '../../../../strings'

export interface CityResult {
  key: number
  city: City
  /** Read out: "Manchester, England, United Kingdom". */
  label: string
  name: string
  /** "England, United Kingdom". */
  detail: string
}

/** The cities that match, each a button that places it; or that none do. */
export function CityResults({ results, onPick }: { results: CityResult[]; onPick: (city: City) => void }) {
  if (results.length === 0) return <p className="muted city-search-status">{strings.cityResults.noPlacesFound}</p>
  return (
    <ul className="city-search-results" aria-label={strings.cityResults.matchingPlaces}>
      {results.map((result) => (
        <li key={result.key}>
          <button type="button" className="link-button" aria-label={result.label} onClick={() => onPick(result.city)}>
            <strong>{result.name}</strong>
            <span className="muted"> {result.detail}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
