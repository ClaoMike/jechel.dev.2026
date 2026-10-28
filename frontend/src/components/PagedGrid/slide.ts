/** The timing of a page sliding in and out of the grid. */

/** In case an animation never ends (e.g. the tab went to the background mid-way). */
export const SLIDE_FALLBACK_MS = 800

/** How the grid's height follows a slide: the same time and easing as the slide (glass.css), so Previous / Next glide with it. */
export const RESIZE = { duration: 550, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }
