import type { ReactNode } from 'react'
import { AutomateIcon, CodeIcon, GlobeIcon } from '@/shared/ui/icons'
import { WorkWithMePrice } from '../WorkWithMePrice/WorkWithMePrice'
import { SERVICES, STEPS, type ServiceIcon } from '../../lib/workWithMe'
import { strings } from '@/shared/i18n'

const ICONS: Record<ServiceIcon, ReactNode> = {
  website: <GlobeIcon size={24} />,
  api: <CodeIcon size={24} />,
  automation: <AutomateIcon size={24} />,
}

/** Work with me: what I offer, how a project goes, and the price (the admin sets it here). */
export function WorkWithMe() {
  return (
    <div className="work-with-me">
      <section aria-labelledby="work-services-title">
        <h4 id="work-services-title">{strings.workWithMe.whatIDo}</h4>
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
        <h4 id="work-steps-title">{strings.workWithMe.howWorks}</h4>
        <ol className="work-steps">
          {STEPS.map((step) => (
            <li key={step.title} className="work-step">
              <strong>{step.title}</strong>
              <p className="muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <WorkWithMePrice />
    </div>
  )
}
