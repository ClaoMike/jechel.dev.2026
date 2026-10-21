/** What the API says about the site, the terms, the support link and videos, for tests. */
import type { LeetCodeStats, Page, ResumeSettingsDetails, SiteStatus, TermsDocument, YouTubeVideo } from '../../services/api'
import thumbA from './thumb-a.svg?url'
import thumbB from './thumb-b.svg?url'

export const SITE: SiteStatus = {
  pages: { whatsNew: true, apps: true, youtube: true, about: true, contact: true },
  features: { meetings: true, coffee: true, updates: true },
  maintenance: false,
  maintenanceMessage: '',
  updatedAt: '2026-10-01T09:00:00Z',
}

export const TERMS: TermsDocument = {
  title: 'Terms and Conditions',
  intro: 'These terms cover your use of [jechel.dev](https://jechel.dev).',
  sections: [
    { heading: 'Who runs this site', blocks: [{ kind: 'paragraph', text: 'Claudiu Mihai Jechel, as a personal portfolio.', items: [] }] },
    {
      heading: 'What you agree to',
      blocks: [
        { kind: 'paragraph', text: 'By using the site you agree to the following.', items: [] },
        { kind: 'bullets', text: '', items: ['Use it lawfully.', 'Read the [privacy notes](/terms).'] },
      ],
    },
  ],
  updatedAt: '2026-09-15T12:00:00Z',
}

export const SUPPORT_URL = 'https://buymeacoffee.com/jechel'

export function makeVideo(n: number, overrides: Partial<YouTubeVideo> = {}): YouTubeVideo {
  return {
    id: `video${String(n).padStart(6, '0')}`,
    title: `Video ${n}`,
    description: `What video ${n} is about. More at https://example.com/${n}`,
    thumbnailUrl: n % 2 ? thumbA : thumbB,
    publishedAt: `2026-10-${String(1 + (n % 28)).padStart(2, '0')}T18:00:00Z`,
    url: `https://www.youtube.com/watch?v=video${String(n).padStart(6, '0')}`,
    ...overrides,
  }
}

export const VIDEOS: YouTubeVideo[] = [
  makeVideo(1, { title: 'Building a lighthouse game', publishedAt: '2026-10-12T18:00:00Z' }),
  makeVideo(2, { title: 'Redux Toolkit in a weekend', publishedAt: '2026-10-05T18:00:00Z' }),
  makeVideo(3, { title: 'No description', description: '', publishedAt: '2026-09-28T18:00:00Z' }),
]

export function pageOfVideos(items = VIDEOS, page = 1, pageSize = 9, totalCount = items.length): Page<YouTubeVideo> {
  return { items, page, pageSize, totalCount }
}

export const LEETCODE: LeetCodeStats = {
  username: 'jechel',
  solved: { all: 420, easy: 180, medium: 200, hard: 40 },
  total: { all: 3400, easy: 850, medium: 1780, hard: 770 },
  fetchedAt: new Date().toISOString(),
}

export const RESUME: ResumeSettingsDetails = {
  phone: '+44 7700 900123',
  email: 'claudiu@example.com',
  headline: 'Full-stack engineer · .NET, React, PostgreSQL',
  sections: ['statuses', 'links', 'experience', 'skills', 'education'],
  excludedSkills: [],
  generatedAt: '2026-10-10T10:00:00Z',
}
