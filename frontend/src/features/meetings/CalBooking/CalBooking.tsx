import { useCalBookingViewModel, type CalBookingProps } from './CalBooking.viewModel'

/**
 * Cal.com's booking page, in the Contact page: the visitor sees when Claudiu is free and picks a
 * slot. It comes from cal.com (their script and frame). The name and email typed in the contact
 * form are filled in for them.
 */
export function CalBooking(props: CalBookingProps) {
  const vm = useCalBookingViewModel(props)
  return <div id={vm.id} className="cal-embed" role="region" aria-label="Book a meeting with Claudiu (Cal.com)" />
}
