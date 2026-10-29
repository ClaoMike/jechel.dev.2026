/** The city search behind the "Where I've been" map editor. */

import { get } from '../http'

/** A place from the city search. */
export interface City {
  id: number
  name: string
  region: string
  country: string
  latitude: number
  longitude: number
  population: number
}

export const placesEndpoints = {
  /** Admin only. Cities whose name starts with the query, largest first. "manchester, england" narrows by region or country. */
  searchCities(query: string, signal?: AbortSignal): Promise<City[]> {
    return get<City[]>('/api/places/search', { params: { q: query }, signal })
  },
}
