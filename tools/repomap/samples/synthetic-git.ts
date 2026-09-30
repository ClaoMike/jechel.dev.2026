/**
 * Generates a realistic git.json for the fictional "Bookshelf" app of the demo graph: feature
 * branches merged through pull requests (merge commits and squashes), a release branch with a
 * hotfix, tags, open and draft pull requests, a local branch behind its remote and uncommitted
 * changes. File paths match the demo graph, so the two tabs link to each other in the demo too.
 *
 *   node samples/synthetic-git.ts --out viewer/public/samples/demo.git.json
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { GIT_HISTORY_VERSION, type GitCommit, type GitFileChange, type GitHistory, type GitPullRequest, type GitRef } from '../src/shared/git-types.ts'
import { hashString, seededRandom } from '../src/shared/rng.ts'

const { values } = parseArgs({ options: { out: { type: 'string', default: 'viewer/public/samples/demo.git.json' } } })

const random = seededRandom(20260105)
const ADA = 'Ada Park'
const RAVI = 'Ravi Mehta'
const LENA = 'Lena Novak'
const TOM = 'Tom Okafor'
const MIA = 'Mia Santos'
const BOT = 'dependabot[bot]'

const commits: GitCommit[] = []
const tips = new Map<string, string>()
/** Files changed on a branch since it was created (what its merge brings in). */
const branchFiles = new Map<string, Set<string>>()
const existing = new Set<string>()
const pullRequests: GitPullRequest[] = []
let clock = Date.parse('2026-01-05T09:12:00Z') / 1000

function makeHash(seed: string): string {
  let hex = ''
  for (let salt = 0; hex.length < 40; salt++) hex += hashString(`${salt}:${seed}`).toString(16).padStart(8, '0')
  return hex.slice(0, 40)
}

/** Moves the clock forward by roughly `hours` (working hours only, no weekends). */
function later(hours: number): void {
  clock += Math.round(hours * 3600 * (0.55 + random() * 0.9))
  const date = new Date(clock * 1000)
  const hour = date.getUTCHours()
  if (hour >= 19) clock += (24 - hour + 8) * 3600 + Math.round(random() * 5400)
  else if (hour < 8) clock += (8 - hour) * 3600 + Math.round(random() * 3600)
  const day = new Date(clock * 1000).getUTCDay()
  if (day === 6) clock += 2 * 86_400
  if (day === 0) clock += 86_400
}

function at(iso: string): void {
  clock = Math.max(clock + 600, Date.parse(iso) / 1000)
}

function change(path: string, size = 1): GitFileChange {
  const isNew = !existing.has(path)
  existing.add(path)
  const additions = Math.max(1, Math.round((isNew ? 30 + random() * 120 : 2 + random() * 40) * size))
  const deletions = isNew ? 0 : Math.round(random() * additions * 0.7)
  return { path, status: isNew ? 'A' : 'M', additions, deletions }
}

interface CommitOptions {
  author: string
  files?: string[]
  body?: string
  coAuthors?: string[]
  committer?: string
  parents?: string[]
  hours?: number
}

function commit(branch: string, subject: string, options: CommitOptions): string {
  later(options.hours ?? 3)
  const parents = options.parents ?? (tips.has(branch) ? [tips.get(branch)!] : [])
  const files = (options.files ?? []).map((path) => change(path, options.parents && options.parents.length > 1 ? 0.6 : 1))
  const hash = makeHash(`${commits.length}:${subject}`)
  const result: GitCommit = { hash, parents, author: options.author, date: clock, subject }
  if (options.committer) {
    result.committer = options.committer
    result.committedAt = clock + 40
  }
  if (options.body) result.body = options.body
  if (options.coAuthors) result.coAuthors = options.coAuthors
  if (files.length > 0) {
    result.files = files
    result.stats = {
      files: files.length,
      additions: files.reduce((sum, f) => sum + (f.additions ?? 0), 0),
      deletions: files.reduce((sum, f) => sum + (f.deletions ?? 0), 0),
    }
  }
  commits.push(result)
  tips.set(branch, hash)
  const touched = branchFiles.get(branch)
  if (touched) for (const f of options.files ?? []) touched.add(f)
  return hash
}

function branch(name: string, from: string): void {
  tips.set(name, tips.get(from)!)
  branchFiles.set(name, new Set())
}

/** A pull request merged with a merge commit ("Merge pull request #N from acme/branch"). */
function mergePr(number: number, source: string, target: string, title: string, author: string, merger = author): string {
  const files = [...(branchFiles.get(source) ?? [])]
  const hash = commit(target, `Merge pull request #${number} from acme/${source}`, {
    author: merger,
    committer: 'GitHub',
    parents: [tips.get(target)!, tips.get(source)!],
    files,
    body: title,
    hours: 2,
  })
  for (const f of files) branchFiles.get(target)?.add(f)
  pullRequests.push({
    number,
    title,
    state: 'merged',
    source,
    target,
    author: login(author),
    mergeCommit: hash,
    headCommit: tips.get(source),
    mergedAt: new Date(clock * 1000).toISOString(),
    createdAt: new Date((clock - 3 * 86_400) * 1000).toISOString(),
    origin: 'github',
  })
  return hash
}

/** A pull request squashed into one commit ("Title (#N)"); its branch never reaches the history. */
function squashPr(number: number, source: string, target: string, title: string, author: string, files: string[], body?: string): string {
  const hash = commit(target, `${title} (#${number})`, { author, committer: 'GitHub', files, body, hours: 26 })
  pullRequests.push({
    number,
    title,
    state: 'merged',
    source,
    target,
    author: login(author),
    mergeCommit: hash,
    mergedAt: new Date(clock * 1000).toISOString(),
    createdAt: new Date((clock - 2 * 86_400) * 1000).toISOString(),
    origin: 'github',
  })
  return hash
}

function login(name: string): string {
  return name.includes('[bot]') ? name : name.toLowerCase().replace(/\s+/g, '-')
}

const api = (path: string) => `api/src/Bookshelf.Api/${path}`
const web = (path: string) => `web/src/${path}`
const feature = (plural: string, entity: string) => ({
  entity: api(`Data/${entity}.cs`),
  service: api(`Features/${plural}/${entity}Service.cs`),
  endpoints: api(`Features/${plural}/${plural}Endpoints.cs`),
  unit: `api/tests/Bookshelf.Api.UnitTests/${entity}ServiceTests.cs`,
  integration: `api/tests/Bookshelf.Api.IntegrationTests/${plural}EndpointTests.cs`,
  page: web(`features/${plural.toLowerCase()}/${plural}Page.tsx`),
  pageTest: web(`features/${plural.toLowerCase()}/${plural}Page.test.tsx`),
  list: web(`features/${plural.toLowerCase()}/${entity}List.tsx`),
  card: web(`features/${plural.toLowerCase()}/${entity}Card.tsx`),
  form: web(`features/${plural.toLowerCase()}/${entity}Form.tsx`),
  detail: web(`features/${plural.toLowerCase()}/${entity}DetailPage.tsx`),
  hook: web(`features/${plural.toLowerCase()}/use${plural}.ts`),
  e2e: `web/e2e/${plural.toLowerCase()}.spec.ts`,
})
const SNAPSHOT = api('Data/Migrations/AppDbContextModelSnapshot.cs')
const CONTEXT = api('Data/AppDbContext.cs')

// ---------------------------------------------------------------- January: scaffold, books, authors

commit('main', 'Initial commit', { author: ADA, files: ['README.md'], committer: 'GitHub' })
commit('main', 'Scaffold the API and the web app', {
  author: ADA,
  files: [api('Program.cs'), api('Bookshelf.Api.csproj'), api('appsettings.json'), 'web/package.json', 'web/index.html', web('main.tsx'), web('App.tsx'), 'web/vite.config.ts', web('index.css')],
  body: 'ASP.NET Core minimal API with EF Core + PostgreSQL, React + Vite front end.',
})
commit('main', 'Add docker-compose for PostgreSQL', { author: TOM, files: ['docker-compose.yml', api('appsettings.json')] })

const books = feature('Books', 'Book')
branch('feature/books', 'main')
commit('feature/books', 'Add the Book entity and first migration', { author: ADA, files: [books.entity, CONTEXT, api('Data/Migrations/20260101_AddBooks.cs'), SNAPSHOT] })
commit('main', 'Set up CI for the API and the web app', { author: TOM, files: ['.github/workflows/ci.yml'], hours: 5 })
commit('feature/books', 'Books endpoints and service', { author: ADA, files: [books.service, books.endpoints, api('Program.cs')] })
commit('feature/books', 'Unit and integration tests for books', {
  author: ADA,
  files: [books.unit, books.integration, 'api/tests/Bookshelf.Api.IntegrationTests/ApiFactory.cs'],
})
commit('feature/books', 'Books page: list, card and form', { author: LENA, files: [books.page, books.list, books.card, books.form, books.hook, web('services/api.ts')], coAuthors: [ADA] })
commit('feature/books', 'Book detail page', { author: LENA, files: [books.detail, web('App.tsx')] })
commit('feature/books', 'Page tests and e2e for books', { author: LENA, files: [books.pageTest, books.e2e, web('test/server.ts')] })
mergePr(1, 'feature/books', 'main', 'Books: list, detail and create', ADA)

squashPr(2, 'dependabot/npm_and_yarn/web/vite-7.1.5', 'main', 'Bump vite from 7.1.2 to 7.1.5 in /web', BOT, ['web/package.json'], 'Bumps [vite](https://github.com/vitejs/vite) from 7.1.2 to 7.1.5.')

const authors = feature('Authors', 'Author')
at('2026-01-26T09:30:00Z')
squashPr(3, 'feature/authors', 'main', 'Authors: pages, API and tests', RAVI, [
  authors.entity, CONTEXT, api('Data/Migrations/20260201_AddAuthors.cs'), SNAPSHOT, authors.service, authors.endpoints, authors.unit, authors.integration,
  authors.page, authors.list, authors.card, authors.form, authors.detail, authors.hook, authors.pageTest, authors.e2e,
], 'Adds authors end to end.\n\n- Author entity, migration and endpoints\n- Pages and forms\n- Unit, integration and e2e tests')

// ---------------------------------------------------------------- February: auth, first preview

at('2026-02-02T10:00:00Z')
branch('feature/auth', 'main')
commit('feature/auth', 'Cookie authentication for the API', { author: TOM, files: [api('Features/Auth/AuthSetup.cs'), api('Features/Auth/AuthEndpoints.cs'), api('Program.cs')] })
commit('main', 'Document local setup in the README', { author: ADA, files: ['README.md'], hours: 4 })
commit('feature/auth', 'Auth context and useAuth hook', { author: LENA, files: [web('auth/AuthProvider.tsx'), web('auth/authContext.ts'), web('auth/useAuth.ts')] })
commit('main', 'Books: validate ISBN on create', { author: RAVI, files: [books.service, books.unit], hours: 5 })
commit('feature/auth', "Merge branch 'main' into feature/auth", { author: TOM, parents: [tips.get('feature/auth')!, tips.get('main')!], files: [books.service, 'README.md'], hours: 3 })
commit('feature/auth', 'Protect write endpoints', { author: TOM, files: [books.endpoints, authors.endpoints, api('Features/Auth/AuthSetup.cs')] })
commit('feature/auth', 'Layout with sign-in state', { author: LENA, files: [web('components/Layout.tsx'), web('App.tsx')] })
mergePr(4, 'feature/auth', 'main', 'Sign-in with cookie auth; protect writes', TOM, ADA)
commit('main', 'Fix flaky books e2e test', { author: LENA, files: [books.e2e], hours: 20 })
const preview = tips.get('main')!

// ---------------------------------------------------------------- March–April: reviews and orders in parallel

at('2026-03-02T09:00:00Z')
const reviews = feature('Reviews', 'Review')
const orders = feature('Orders', 'Order')
branch('feature/reviews', 'main')
branch('feature/orders', 'main')
commit('feature/reviews', 'Review entity and migration', { author: RAVI, files: [reviews.entity, CONTEXT, api('Data/Migrations/20260301_AddReviews.cs'), SNAPSHOT] })
commit('feature/orders', 'Order entity and migration', { author: MIA, files: [orders.entity, CONTEXT, api('Data/Migrations/20260401_AddOrders.cs'), SNAPSHOT] })
commit('feature/reviews', 'Reviews endpoints and service', { author: RAVI, files: [reviews.service, reviews.endpoints] })
commit('feature/orders', 'Order service with totals', { author: MIA, files: [orders.service, orders.unit] })
commit('main', 'Upgrade to .NET 10', { author: TOM, files: [api('Bookshelf.Api.csproj'), '.github/workflows/ci.yml'] })
commit('feature/reviews', 'Reviews UI on the book page', { author: LENA, files: [reviews.list, reviews.card, reviews.form, books.detail, reviews.hook] })
commit('feature/orders', 'Orders endpoints', { author: MIA, files: [orders.endpoints, orders.integration] })
commit('feature/reviews', 'Review tests', { author: RAVI, files: [reviews.unit, reviews.integration, reviews.pageTest] })
mergePr(6, 'feature/reviews', 'main', 'Book reviews', RAVI, ADA)
commit('feature/orders', "Merge branch 'main' into feature/orders", { author: MIA, parents: [tips.get('feature/orders')!, tips.get('main')!], files: [api('Bookshelf.Api.csproj'), CONTEXT, SNAPSHOT] })
commit('feature/orders', 'Orders pages', { author: LENA, files: [orders.page, orders.list, orders.card, orders.form, orders.detail, orders.hook], coAuthors: [MIA] })
commit('feature/reviews-page', 'Reviews page', { author: LENA, parents: [tips.get('main')!], files: [reviews.page, reviews.detail, reviews.e2e] })
branchFiles.set('feature/reviews-page', new Set([reviews.page, reviews.detail, reviews.e2e]))
commit('feature/orders', 'Order e2e and page tests', { author: MIA, files: [orders.e2e, orders.pageTest] })
mergePr(7, 'feature/orders', 'main', 'Orders with totals', MIA, ADA)
mergePr(8, 'feature/reviews-page', 'main', 'Reviews page', LENA)
const staleOrders = tips.get('feature/orders')!

// ---------------------------------------------------------------- May: release 1.0 and a hotfix

at('2026-05-04T09:00:00Z')
branch('release/1.0', 'main')
commit('release/1.0', 'Bump version to 1.0.0', { author: ADA, files: ['web/package.json', api('Bookshelf.Api.csproj')] })
commit('release/1.0', 'Release notes for 1.0', { author: ADA, files: ['README.md'] })
const v100 = tips.get('release/1.0')!
const customers = feature('Customers', 'Customer')
branch('feature/customers', 'main')
commit('feature/customers', 'Customer entity and migration', { author: RAVI, files: [customers.entity, CONTEXT, api('Data/Migrations/20260501_AddCustomers.cs'), SNAPSHOT] })
branch('hotfix/order-totals', 'release/1.0')
commit('hotfix/order-totals', 'Round order totals to cents', { author: MIA, files: [orders.service, orders.unit], hours: 30 })
mergePr(10, 'hotfix/order-totals', 'release/1.0', 'Hotfix: round order totals', MIA, ADA)
const v101 = tips.get('release/1.0')!
mergePr(9, 'release/1.0', 'main', 'Release 1.0', ADA)
commit('feature/customers', 'Customers endpoints and service', { author: RAVI, files: [customers.service, customers.endpoints, customers.unit, customers.integration] })
commit('feature/customers', 'Customers pages', { author: LENA, files: [customers.page, customers.list, customers.card, customers.form, customers.detail, customers.hook] })
commit('feature/customers', 'Link orders to customers', { author: MIA, files: [orders.entity, customers.entity, CONTEXT, SNAPSHOT, orders.service] })
commit('feature/customers', 'Customer tests', { author: RAVI, files: [customers.pageTest, customers.e2e] })
mergePr(12, 'feature/customers', 'main', 'Customers, and orders linked to them', RAVI, ADA)

// ---------------------------------------------------------------- June–August: shelves, notifications, 1.1

at('2026-06-15T09:00:00Z')
squashPr(11, 'dependabot/nuget/api/Npgsql-10.0.1', 'main', 'Bump Npgsql.EntityFrameworkCore.PostgreSQL from 10.0.0 to 10.0.1', BOT, [api('Bookshelf.Api.csproj')])
const shelfs = feature('Shelfs', 'Shelf')
squashPr(14, 'feature/shelves', 'main', 'Shelves: organise books into shelves', LENA, [
  shelfs.entity, CONTEXT, api('Data/Migrations/20260601_AddShelfs.cs'), SNAPSHOT, shelfs.service, shelfs.endpoints, shelfs.unit, shelfs.integration,
  shelfs.page, shelfs.list, shelfs.card, shelfs.form, shelfs.detail, shelfs.hook, shelfs.pageTest, shelfs.e2e,
])
commit('main', 'Faster book search with a trigram index', { author: RAVI, files: [books.service, CONTEXT, SNAPSHOT], hours: 30 })
const v110 = tips.get('main')!
at('2026-08-03T09:00:00Z')
branch('feature/notifications', 'main')
commit('feature/notifications', 'Email service', { author: TOM, files: [api('Features/Notifications/EmailService.cs'), api('Program.cs'), api('appsettings.json')] })
commit('feature/notifications', 'Send an email when an order ships', { author: TOM, files: [orders.service, api('Features/Notifications/EmailService.cs')] })
commit('main', 'Books: paginate the list endpoint', { author: RAVI, files: [books.endpoints, books.service, books.hook] })
commit('feature/notifications', 'Notification tests', { author: TOM, files: [orders.unit] })
mergePr(15, 'feature/notifications', 'main', 'Order shipped emails', TOM, ADA)

// ---------------------------------------------------------------- September: work in progress

at('2026-09-21T09:00:00Z')
commit('main', 'Update the README screenshots', { author: ADA, files: ['README.md'] })
branch('fix/review-pagination', 'main')
branch('feature/wishlist', 'main')
commit('fix/review-pagination', 'Paginate reviews on the book page', { author: RAVI, files: [reviews.endpoints, reviews.list, reviews.hook] })
commit('feature/wishlist', 'Wishlist entity and endpoints', { author: LENA, files: [api('Features/Wishlist/WishlistEndpoints.cs'), CONTEXT, SNAPSHOT] })
commit('feature/wishlist', 'Wishlist button on book cards', { author: LENA, files: [web('features/wishlist/useWishlist.ts'), books.card] })
const pushedWishlist = tips.get('feature/wishlist')!
const localMain = tips.get('main')!
commit('main', 'Fix the customers page on small screens', { author: MIA, files: [customers.page, web('index.css')], hours: 20 })
commit('main', 'Bump Playwright', { author: TOM, files: ['web/package.json', '.github/workflows/ci.yml'] })
commit('feature/wishlist', 'Wishlist page', { author: LENA, files: [web('features/wishlist/WishlistPage.tsx'), web('App.tsx')], hours: 20 })

pullRequests.push(
  {
    number: 18,
    title: 'Paginate reviews on the book page',
    state: 'open',
    draft: true,
    source: 'fix/review-pagination',
    target: 'main',
    author: login(RAVI),
    headCommit: tips.get('fix/review-pagination'),
    createdAt: new Date((clock - 5 * 86_400) * 1000).toISOString(),
    origin: 'github',
  },
  {
    number: 17,
    title: 'Wishlist',
    state: 'open',
    source: 'feature/wishlist',
    target: 'main',
    author: login(LENA),
    headCommit: pushedWishlist,
    createdAt: new Date((clock - 3 * 86_400) * 1000).toISOString(),
    origin: 'github',
  },
  {
    number: 16,
    title: 'Experiment: GraphQL gateway',
    state: 'closed',
    source: 'spike/graphql',
    target: 'main',
    author: login(TOM),
    createdAt: '2026-08-18T10:02:00Z',
    closedAt: '2026-08-25T16:40:00Z',
    origin: 'github',
  },
  {
    number: 13,
    title: 'Dark mode',
    state: 'closed',
    source: 'feature/dark-mode',
    target: 'main',
    author: login(LENA),
    createdAt: '2026-06-22T09:10:00Z',
    closedAt: '2026-06-24T11:00:00Z',
    origin: 'github',
  },
  {
    number: 5,
    title: 'Upgrade React Router',
    state: 'closed',
    source: 'chore/react-router',
    target: 'main',
    author: login(LENA),
    createdAt: '2026-02-16T09:10:00Z',
    closedAt: '2026-02-17T15:00:00Z',
    origin: 'github',
  },
)

// ---------------------------------------------------------------- refs and output

const refs: GitRef[] = [
  { name: 'feature/orders', type: 'branch', commit: staleOrders, upstream: 'origin/feature/orders', gone: true },
  { name: 'feature/wishlist', type: 'branch', commit: tips.get('feature/wishlist')!, upstream: 'origin/feature/wishlist', ahead: 1 },
  { name: 'main', type: 'branch', commit: localMain, upstream: 'origin/main', behind: 2 },
  { name: 'release/1.0', type: 'branch', commit: tips.get('release/1.0')!, upstream: 'origin/release/1.0' },
  { name: 'origin/feature/wishlist', type: 'remote', commit: pushedWishlist },
  { name: 'origin/fix/review-pagination', type: 'remote', commit: tips.get('fix/review-pagination')! },
  { name: 'origin/main', type: 'remote', commit: tips.get('main')! },
  { name: 'origin/release/1.0', type: 'remote', commit: tips.get('release/1.0')! },
  { name: 'v0.1.0', type: 'tag', commit: preview, message: 'First preview' },
  { name: 'v1.0.0', type: 'tag', commit: v100, message: 'Bookshelf 1.0' },
  { name: 'v1.0.1', type: 'tag', commit: v101 },
  { name: 'v1.1.0', type: 'tag', commit: v110, message: 'Shelves and faster search' },
]

// Newest first; every commit was made after its parents, so time order is also topological.
commits.sort((a, b) => (b.committedAt ?? b.date) - (a.committedAt ?? a.date))
const byHash = new Map(commits.map((c) => [c.hash, c]))
for (const pr of pullRequests) if (pr.state === 'merged' && pr.mergeCommit) byHash.get(pr.mergeCommit)!.pr = pr.number
pullRequests.sort((a, b) => b.number - a.number)

const history: GitHistory = {
  kind: 'repomap-git',
  version: GIT_HISTORY_VERSION,
  generatedAt: new Date((clock + 3600) * 1000).toISOString(),
  repo: {
    name: 'bookshelf (demo)',
    head: { branch: 'feature/wishlist', commit: tips.get('feature/wishlist')! },
    defaultBranch: 'main',
    remotes: [{ name: 'origin', url: 'https://git.example.com/acme/bookshelf.git' }],
  },
  commits,
  refs,
  pullRequests,
  workingTree: {
    staged: 1,
    unstaged: 1,
    untracked: 1,
    conflicted: 0,
    files: [
      { path: web('services/api.ts'), status: 'M ' },
      { path: books.card, status: ' M' },
      { path: web('features/wishlist/WishlistButton.tsx'), status: '??' },
    ],
  },
  sources: { pullRequests: ['messages', 'github'], github: { fetchedAt: new Date((clock + 3000) * 1000).toISOString() } },
}

const out = resolve(values.out!)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, `${JSON.stringify(history)}\n`)
console.log(`${commits.length} commits, ${refs.length} refs, ${pullRequests.length} pull requests → ${out}`)
