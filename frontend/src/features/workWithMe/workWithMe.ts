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
    title: 'Websites, end to end',
    text: 'Full-stack websites, from the database to the page you see: designed, built, tested and put live.',
  },
  {
    icon: 'api',
    title: 'APIs',
    text: 'APIs your apps and partners can rely on: secure, documented and tested.',
  },
  {
    icon: 'automation',
    title: 'Automations for your company',
    text: 'The manual work your team repeats every day, done automatically, and your apps connected so data flows between them.',
  },
]

export interface Step {
  title: string
  text: string
}

export const STEPS: readonly Step[] = [
  { title: 'A free call or meeting', text: 'Online or in person, whichever suits you and where you are. You tell me what you need.' },
  { title: 'A plan', text: 'I work out what to build and how, step by step.' },
  { title: 'The plan, presented', text: 'I walk you through it, and you decide whether to go ahead.' },
  { title: 'Price, then building', text: 'We agree the price, I build it, and we keep each other in the loop all the way.' },
]

/** The amount and currency are the admin's (the API's); these are the words around them. */
export const PRICE = {
  per: 'an hour',
  note: "The final price is agreed together, once you've seen the plan.",
}
