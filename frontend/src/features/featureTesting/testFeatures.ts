import type { ComponentType } from 'react'

/** A feature the admin tries out on the site before visitors get it (the Feature Testing tab). */
export interface TestFeature {
  /** Its address under /features: 'work-with-me' is /features/work-with-me. */
  slug: string
  /** Its name in the features' navigation, and its heading. */
  title: string
  /** A line on what it is, or what to try. */
  description: string
  /** The feature itself. */
  Component: ComponentType
}

/**
 * The features being tested, in the navigation's order. A new feature goes here first (its own component, in its own
 * folder under features/), for the admin to try on the real site; once it's ready, it moves to where visitors will see
 * it, and off this list.
 */
export const TEST_FEATURES: readonly TestFeature[] = []
