import type { ReactNode } from 'react'
import { AutomateIcon, CodeIcon, GlobeIcon } from '../../../components/icons/icons'
import { ContactForm } from '../../contact/ContactForm/ContactForm'
import { PRICE, SERVICES, STEPS, type ServiceIcon } from '../workWithMe'

const ICONS: Record<ServiceIcon, ReactNode> = {
  website: <GlobeIcon size={24} />,
  api: <CodeIcon size={24} />,
  automation: <AutomateIcon size={24} />,
}

/** Work with me: what I offer, how a project goes, the price, and a form to start one (a project enquiry in the inbox). */
export function WorkWithMe() {
  return (
    <div className="work-with-me">
      <p className="work-with-me-lead">I build websites and the systems behind them, end to end, and automate the work your team still does by hand.</p>

      <section aria-labelledby="work-services-title">
        <h4 id="work-services-title">What I do</h4>
        <ul className="work-services">
          {SERVICES.map((service) => (
            <li key={service.icon} className="work-service">
              <span className="work-service-icon">{ICONS[service.icon]}</span>
              <strong>{service.title}</strong>
              <p className="muted">{service.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="work-steps-title">
        <h4 id="work-steps-title">How it works</h4>
        <ol className="work-steps">
          {STEPS.map((step) => (
            <li key={step.title} className="work-step">
              <strong>{step.title}</strong>
              <p className="muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="work-price-title" className="work-price">
        <h4 id="work-price-title">Price</h4>
        <p>
          <span className="work-price-amount">{PRICE.amount}</span> {PRICE.per}
        </p>
        <p className="muted">{PRICE.note}</p>
      </section>

      <ContactForm
        topic="project"
        title="Tell me about your project"
        intro="What you'd like built or automated, and anything I should know. I'll reply by email to set up the call. All fields are required."
      />
    </div>
  )
}
