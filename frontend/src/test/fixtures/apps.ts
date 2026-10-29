/** Apps for tests: realistic, with local images so screenshots never depend on the network. */
import type { AppCategory, AppDetails, Page } from '@/shared/api'
import forest from './tile-forest.svg?url'
import sunset from './tile-sunset.svg?url'

export const CATEGORIES: AppCategory[] = [
  { id: 1, name: 'Mobile app' },
  { id: 2, name: 'Website' },
  { id: 3, name: 'Video game' },
]

export function makeApp(id: number, overrides: Partial<AppDetails> = {}): AppDetails {
  return {
    id,
    title: `App ${id}`,
    description: `What app ${id} does, in a sentence or two.`,
    categories: [CATEGORIES[(id - 1) % CATEGORIES.length]],
    platforms: ['iOS', 'Android'],
    links: [{ label: 'App Store', url: 'https://apps.apple.com/app/id1' }],
    media: [{ url: id % 2 ? sunset : forest, kind: 'image' }],
    createdAt: `2026-10-${String(10 + (id % 18)).padStart(2, '0')}T12:00:00Z`,
    showInWhatsNew: true,
    ...overrides,
  }
}

export const APPS: AppDetails[] = [
  makeApp(1, {
    title: 'LIGHTHOUSE',
    description: 'A moody defense game: shine the [lighthouse beam](https://example.com/beam) and hold off the night.',
    categories: [CATEGORIES[2]],
    platforms: ['Windows'],
  }),
  makeApp(2, { title: 'Pocket Planner', description: 'Plans your week on your phone.', categories: [CATEGORIES[0], CATEGORIES[1]] }),
  makeApp(3, { title: 'No Picture', description: 'An app without any images yet.', media: [] }),
]

export function pageOf<T>(items: T[], { page = 1, pageSize = 9, totalCount = items.length } = {}): Page<T> {
  return { items, page, pageSize, totalCount }
}
