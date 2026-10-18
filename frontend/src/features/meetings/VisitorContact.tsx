import { useEffect, useId, useState } from 'react'
import { api } from '../../services/api'
import { ContactForm } from '../contact/ContactForm'
import { CalBooking } from './CalBooking'

type Mode = 'message' | 'meeting'

/**
 * The visitor's Contact page: the contact form, and, once a Cal.com page is set (Settings), the choice
 * to book a meeting instead: they see when Claudiu is free and pick a slot, which he then accepts.
 */
export function VisitorContact() {
  const id = useId()
  const [calLink, setCalLink] = useState('')
  const [mode, setMode] = useState<Mode>('message')
  const [booked, setBooked] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    api.meetings
      .info(controller.signal)
      .then(setCalLink)
      .catch(() => {
        // No meetings offered: the form alone.
      })
    return () => controller.abort()
  }, [])

  if (!calLink) return <ContactForm />

  return (
    <div className="visitor-contact">
      <fieldset className="contact-mode">
        <legend className="visually-hidden">How would you like to get in touch?</legend>
        {(
          [
            ['message', 'Send a message'],
            ['meeting', 'Book a meeting'],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="contact-mode-option">
            <input type="radio" name={id} value={value} checked={mode === value} onChange={() => setMode(value)} className="visually-hidden" />
            {label}
          </label>
        ))}
      </fieldset>
      {mode === 'message' ? (
        <ContactForm />
      ) : (
        <section className="card contact-meeting" aria-labelledby={`${id}-title`}>
          <h2 id={`${id}-title`}>Book a meeting</h2>
          <p className="muted">Pick a time that suits you from when I'm free. I'll confirm it by email, usually within a day.</p>
          {booked && (
            <p role="status" className="contact-meeting-booked">
              Thanks! Your request is in: you'll get an email once I've confirmed it.
            </p>
          )}
          <CalBooking calLink={calLink} onBooked={() => setBooked(true)} />
        </section>
      )}
    </div>
  )
}
