import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/** The 1-based page number in the URL (?page=N; none means 1), and a function that changes it. */
export function usePageParam(): [page: number, goToPage: (page: number) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const goToPage = useCallback((next: number) => setSearchParams(next === 1 ? {} : { page: String(next) }), [setSearchParams])
  return [page, goToPage]
}
