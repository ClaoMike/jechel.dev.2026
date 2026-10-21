import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { Loading, Skeleton, SkeletonList } from '../../../components/Skeleton'
import { useSiteVisibilityViewModel, useSwitchViewModel, type SwitchItem } from './SiteVisibility.viewModel'

/**
 * Settings → Visitor pages: what visitors can see, switched on one by one as each part is ready
 * (everything starts off), and maintenance mode. Each switch saves at once.
 */
export function SiteVisibility() {
  const vm = useSiteVisibilityViewModel()

  if (vm.status === 'loading')
    return (
      <section className="card site-visibility">
        <Loading label="Loading the visitor pages…">
          <Skeleton width="30%" height={20} />
          <SkeletonList rows={5} />
        </Loading>
      </section>
    )
  if (vm.status === 'error') return <ErrorState message="The visitor pages couldn't be loaded." onRetry={vm.retry} />

  return (
    <section className="card site-visibility" aria-labelledby={`${vm.id}-title`}>
      <h3 id={`${vm.id}-title`}>Visitor pages</h3>
      <p className="muted">
        What visitors can see. Everything starts off: switch each part on once it's ready. You always see every page (hidden ones are marked in the tabs).
        {vm.allPagesOff && ' With every page off, visitors get "Coming soon".'}
      </p>
      {vm.error && <p role="alert" className="field-error">{vm.error}</p>}

      <fieldset className="switch-list">
        <legend className="field-label">Pages</legend>
        {vm.pages.map((item) => (
          <Switch key={item.key} item={item} />
        ))}
      </fieldset>

      <fieldset className="switch-list">
        <legend className="field-label">Features</legend>
        {vm.features.map((item) => (
          <Switch key={item.key} item={item} />
        ))}
      </fieldset>

      <fieldset className="switch-list">
        <legend className="field-label">Maintenance</legend>
        <Switch item={vm.maintenance} />
        <div className="field">
          <label htmlFor={`${vm.id}-message`}>Message on the maintenance page (optional)</label>
          <div className="settings-input-row">
            <input id={`${vm.id}-message`} type="text" maxLength={300} value={vm.draftMessage} placeholder="Back by 18:00" onChange={(e) => vm.setMessage(e.target.value)} />
            <button type="button" className="button" disabled={!vm.canSaveMessage} onClick={vm.saveMessage}>
              Save
            </button>
          </div>
        </div>
      </fieldset>
    </section>
  )
}

/** An on / off switch (a button with role="switch"). */
function Switch({ item }: { item: SwitchItem }) {
  const { id } = useSwitchViewModel()
  return (
    <div className="switch-row">
      <span className="switch-text">
        <span id={`${id}-label`}>{item.label}</span>
        {item.hint && (
          <span id={`${id}-hint`} className="muted switch-hint">
            {item.hint}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        className="switch"
        aria-checked={item.on}
        aria-labelledby={`${id}-label`}
        aria-describedby={item.hint ? `${id}-hint` : undefined}
        disabled={item.busy}
        onClick={item.toggle}
      >
        <span className="switch-thumb" aria-hidden="true" />
        <span className="switch-state" aria-hidden="true">
          {item.on ? 'On' : 'Off'}
        </span>
      </button>
    </div>
  )
}
