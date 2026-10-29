import { strings } from '../i18n'

/** Previous / "Page 2 of 5" / Next. Renders nothing when everything fits on one page. */
export function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <nav className="pagination" aria-label={strings.pagination.pagination}>
      <button type="button" className="button button-secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        {strings.pagination.previous}
      </button>
      <span>
        {strings.pagination.page}
        {page} {strings.pagination.of}
        {totalPages}
      </span>
      <button type="button" className="button button-secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        {strings.pagination.next}
      </button>
    </nav>
  )
}
