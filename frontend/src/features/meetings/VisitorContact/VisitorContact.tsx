import { ContactForm } from '../../contact/ContactForm/ContactForm'
import { CalBooking } from '../CalBooking/CalBooking'
import { useVisitorContactViewModel } from './VisitorContact.viewModel'

/**
 * The visitor's Contact page: the contact form, and, once a Cal.com page is set (Settings), the choice
 * to book a meeting instead: they see when Claudiu is free and pick a slot, which he then accepts.
 */
export function VisitorContact() {
  const vm = useVisitorContactViewModel()
  const { id } = vm

  if (!vm.calLink) return <ContactForm />

  return (
    <div className="visitor-contact">
      <fieldset className="contact-mode">
        <legend className="visually-hidden">How would you like to get in touch?</legend>
        {vm.modes.map((option) => (
          <label key={option.value} className="contact-mode-option">
            <input type="radio" name={id} value={option.value} checked={option.checked} onChange={option.choose} className="visually-hidden" />
            {option.label}
          </label>
        ))}
      </fieldset>
      {vm.mode === 'message' ? (
        <ContactForm />
      ) : (
        <section className="card contact-meeting" aria-labelledby={`${id}-title`}>
          <h2 id={`${id}-title`}>Book a meeting</h2>
          <p className="muted">Pick a time that suits you from when I'm free. I'll confirm it by email, usually within a day.</p>
          {vm.booked && (
            <p role="status" className="contact-meeting-booked">
              Thanks! Your request is in: you'll get an email once I've confirmed it.
            </p>
          )}
          <CalBooking calLink={vm.calLink} onBooked={vm.markBooked} />
        </section>
      )}
    </div>
  )
}
