import { useId } from 'react'
import { strings } from '../../i18n'

/**
 * What a view shows when its data couldn't be loaded: what failed, and a way to try again. The same
 * everywhere, so a failure always looks like one (and never like an empty list).
 */
export function ErrorState({ message, onRetry, compact = false }: { message: string; onRetry?: () => void; compact?: boolean }) {
  const id = useId()
  return (
    <div className={compact ? 'error-state error-state-compact' : 'error-state'} role="alert" aria-labelledby={id}>
      <span className="error-state-icon" aria-hidden="true">
        !
      </span>
      <p id={id}>{message}</p>
      {onRetry && (
        <button type="button" className="button button-secondary button-small" onClick={onRetry}>
          {strings.errorState.tryAgain}
        </button>
      )}
    </div>
  )
}
