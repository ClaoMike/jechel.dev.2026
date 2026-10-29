/** Something a view loads, as the view shows it: placeholders, the "Try again" box, or the content. */
export type Loadable<T> = { status: 'loading' } | { status: 'error' } | { status: 'loaded'; data: T }

/** The parts of an RTK Query hook's result that decide what to show. */
interface QueryResult<T> {
  /** The data for the current arguments only (another page's stays out). */
  currentData?: T
  isError: boolean
  isFetching: boolean
}

/**
 * A query's result as a Loadable. A failed load shows the error until it's tried again; while it is,
 * placeholders again. A refresh of what's shown keeps showing it.
 */
export function toLoadable<T>({ currentData, isError, isFetching }: QueryResult<T>): Loadable<T> {
  if (isError) return isFetching ? { status: 'loading' } : { status: 'error' }
  return currentData === undefined ? { status: 'loading' } : { status: 'loaded', data: currentData }
}

/** Pages a paged list has (at least 1). */
export function pageCount(totalCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalCount / pageSize))
}
