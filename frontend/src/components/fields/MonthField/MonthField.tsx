import { useMonthFieldViewModel, type MonthFieldProps } from './MonthField.viewModel'

/**
 * A month: a month picker plus a year box (desktop Safari and Firefox have no <input type="month">).
 * The value is the first of the month, "YYYY-MM-01".
 */
export function MonthField(props: MonthFieldProps) {
  const vm = useMonthFieldViewModel(props)

  return (
    <div className="field" role="group" aria-labelledby={vm.labelId} aria-describedby={vm.errorId}>
      <span className="field-label" id={vm.labelId}>
        {props.label}
      </span>
      <div className="month-field">
        <select aria-label={vm.monthLabel} value={vm.month} onChange={(e) => vm.setMonth(Number(e.target.value))}>
          {vm.months.map((month) => (
            <option key={month.value} value={month.value}>
              {month.name}
            </option>
          ))}
        </select>
        <input aria-label={vm.yearLabel} inputMode="numeric" maxLength={4} value={vm.year} aria-invalid={vm.yearInvalid || undefined} onChange={(e) => vm.setYear(e.target.value)} />
      </div>
      {props.error && (
        <p className="field-error" id={vm.errorId}>
          {props.error}
        </p>
      )}
    </div>
  )
}
