import { useCallback, useEffect, useState } from 'react'
import type { Page } from '../../services/api'

type Result<T> = { page: number; reloads: number } & ({ status: 'loaded'; data: Page<T> } | { status: 'error' })
export type PagedState<T> = { status: 'loading' } | { status: 'loaded'; data: Page<T> } | { status: 'error' }

/** Loads one page of a list at a time, with its own page number (not in the URL: a tab may hold several lists). */
export function usePagedList<T>(load: (page: number, pageSize: number, signal: AbortSignal) => Promise<Page<T>>, pageSize: number) {
  const [page, setPage] = useState(1)
  const [reloads, setReloads] = useState(0)
  const [result, setResult] = useState<Result<T> | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    load(page, pageSize, controller.signal)
      .then((data) => setResult({ status: 'loaded', page, reloads, data }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ status: 'error', page, reloads })
      })
    return () => controller.abort()
  }, [load, page, pageSize, reloads])

  const state: PagedState<T> = result && result.page === page && result.reloads === reloads ? result : { status: 'loading' }
  const totalPages = state.status === 'loaded' ? Math.max(1, Math.ceil(state.data.totalCount / pageSize)) : 1
  const reload = useCallback(() => setReloads((n) => n + 1), [])

  return { state, page, totalPages, setPage, reload }
}
