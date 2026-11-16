import { strings } from '@/shared/i18n'

/** Work with me: what I offer, how a project goes, and the price. The words visitors read, in one place. */

export type ServiceIcon = 'website' | 'api' | 'automation'

export interface Service {
  icon: ServiceIcon
  title: string
  text: string
}

export const SERVICES: readonly Service[] = [
  {
    icon: 'website',
    title: strings.workWithMe.websitesEndEnd,
    text: strings.workWithMe.fullStackWebsitesDatabase,
  },
  {
    icon: 'api',
    title: 'APIs',
    text: strings.workWithMe.apisAppsPartnersCan,
  },
  {
    icon: 'automation',
    title: strings.workWithMe.automationsCompany,
    text: strings.workWithMe.manualWorkTeamRepeats,
  },
]

export interface Step {
  title: string
  text: string
}

export const STEPS: readonly Step[] = [
  { title: strings.workWithMe.freeCallMeeting, text: strings.workWithMe.onlinePersonWhicheverSuits },
  { title: strings.workWithMe.plan, text: strings.workWithMe.iWorkOutWhat },
  { title: strings.workWithMe.planPresented, text: strings.workWithMe.iWalkThroughDecide },
  { title: strings.workWithMe.priceThenBuilding, text: strings.workWithMe.weAgreePriceI },
]

/** The amount and currency are the admin's (the API's); these are the words around them. */
export const PRICE = {
  per: strings.workWithMe.hour,
  note: strings.workWithMe.finalPriceAgreedTogether,
}
