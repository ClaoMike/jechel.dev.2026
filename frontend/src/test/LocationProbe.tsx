import { useLocation } from 'react-router'

/** Where the router is now (path + query), for tests that check the URL (read by renderView's `location()`). */
export function LocationProbe() {
  const { pathname, search } = useLocation()
  return <span hidden data-testid="location" data-location={pathname + search} />
}
