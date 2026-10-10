# jechel.dev.2026

Personal portfolio website of Claudiu Jechel.

| Layer    | Stack                                                           |
| -------- | --------------------------------------------------------------- |
| Frontend | React 19 + Vite 8 + TypeScript (`frontend/`)                    |
| Backend  | .NET 10 minimal API + EF Core 10 + Npgsql (`backend/`)          |
| Database | PostgreSQL 16 (Docker Compose for local dev)                    |
| Tests    | xUnit, Testcontainers, Vitest, React Testing Library, MSW, Playwright |
| CI       | GitHub Actions (`.github/workflows/ci.yml`)                     |

## Repository layout

```
.
├── backend/
│   ├── Portfolio.slnx                     # solution
│   ├── global.json                        # pins .NET SDK 10.0.x
│   ├── src/Portfolio.Api/
│   │   ├── Program.cs                     # composition root (DI, middleware, endpoint mapping)
│   │   ├── Data/                          # DbContext, entities, EF migrations
│   │   └── Features/<Feature>/            # endpoints grouped by feature
│   └── tests/
│       ├── Portfolio.Api.UnitTests/       # fast tests, no external dependencies
│       └── Portfolio.Api.IntegrationTests/# real HTTP pipeline + real PostgreSQL (Testcontainers)
├── frontend/
│   ├── src/
│   │   ├── services/api.ts                # the single API service: every backend call goes through `api`
│   │   ├── auth/                          # AuthProvider, useAuth, <SignedIn>/<SignedOut>
│   │   ├── layout/                        # site frame: greeting, session bar, section tabs
│   │   ├── pages/                         # one component per route
│   │   ├── features/<feature>/            # a feature's components and rules (e.g. contact form + inbox)
│   │   ├── components/                    # shared UI: Modal, CopyButton, icons
│   │   └── test/                          # Vitest setup, MSW mock server, render helpers
│   ├── e2e/                               # Playwright specs
│   └── playwright.config.ts
├── scripts/dev_launcher.py                # GUI launcher for common dev tasks (macOS)
├── docker-compose.yml                     # local PostgreSQL
└── .github/workflows/ci.yml
```

## Prerequisites

- .NET 10 SDK (`dotnet --list-sdks`)
- `dotnet-ef` global tool, for migrations (`dotnet tool install -g dotnet-ef`)
- Node.js 24+
- Docker Desktop, for the local database and the backend integration tests
- Python 3 with Tk, only for the dev launcher (`brew install python-tk@3.14`)

## Ports and URLs

| What        | URL                        | Notes                                                |
| ----------- | -------------------------- | ---------------------------------------------------- |
| Frontend    | http://localhost:5173      | Vite dev server (`strictPort`, fails if taken). Proxies `/api/*` to the API |
| API         | http://localhost:5105      | `http` launch profile. Browse the site via 5173, not 5105 |
| PostgreSQL  | localhost:**5433**         | 5433, not 5432, so it doesn't clash with a Homebrew Postgres |
| OpenAPI doc | http://localhost:5105/openapi/v1.json | Development only                        |

Local DB credentials (dev only): database/user/password all `portfolio`.

## Running locally

```bash
# 1. Database
docker compose up -d --wait

# 2. API (applies EF migrations + seed data on startup in Development)
dotnet run --project backend/src/Portfolio.Api --launch-profile http

# 3. Frontend
cd frontend && npm install && npm run dev
```

### Dev launcher (macOS)

```bash
python3 scripts/dev_launcher.py
```

A small window with buttons. Each opens a new Terminal window running the matching commands from the repo root; stop with Ctrl+C.

| Button             | Runs                                                              |
| ------------------ | ----------------------------------------------------------------- |
| Start backend      | `docker compose up -d --wait`, then the API                       |
| Start frontend     | `npm run dev`                                                     |
| Start website      | Both of the above in two windows. The frontend waits until `/api/health` responds, then opens the site in the browser |
| Open repo map      | `npm start` in `tools/repomap` (runs `npm install` the first time): builds the 3D architecture map, opens it in the browser and rebuilds it on every change. See [tools/repomap/README.md](tools/repomap/README.md) |
| Run backend tests  | `dotnet test`                                                     |
| Run frontend tests | Starts the DB, then Vitest, then Playwright E2E                    |
| Run all tests      | Backend tests, then frontend tests, in one window                 |

The first click may trigger a macOS prompt to allow Terminal automation; allow it.

## API conventions

- **Every endpoint lives under `/api`** (`app.MapGroup("/api")` in `Program.cs`). Feature endpoint files map *relative* routes onto that group.
- The frontend always calls relative `/api/...` URLs, through `src/services/api.ts` (see [Frontend conventions](#frontend-api-service-and-auth-state)). In dev the Vite proxy forwards them to the API, so browser, cookies and API share one origin (no CORS). Production should do the same: serve the SPA and route `/api` to the API on one domain.
- The Vite proxy sends `X-Forwarded-Host/Proto` (`xfwd: true`) and the API runs `UseForwardedHeaders()`, so URLs the API generates use `localhost:5173`, the origin the browser sees. By default only loopback proxies are trusted; configure `KnownProxies`/`KnownNetworks` when deploying behind a real proxy.

| Method | Route                       | Auth    | Description                                        |
| ------ | --------------------------- | ------- | -------------------------------------------------- |
| GET    | `/api/health`               | public  | `Healthy` when the API can reach the database (used by the launcher and Playwright) |
| GET    | `/api/firstname`            | public  | `{ "firstName": "Claudiu" }` from the database      |
| GET    | `/api/auth/login?returnUrl=`| public  | Browser navigation: redirects to Google sign-in    |
| GET    | `/api/auth/signin-google`   | public  | OAuth callback, handled by ASP.NET Core; don't call directly |
| GET    | `/api/auth/me`              | cookie  | Current user `{ email, name, pictureUrl, sessionExpiresInSeconds }`, or **401** |
| POST   | `/api/auth/logout`          | public  | Clears the cookie; when signed in, also ends the session everywhere |
| POST   | `/api/contact`              | public  | Contact form `{ name, email, message }`: **201**, or **400** with field errors (`ValidationProblem`) |
| GET    | `/api/contact/messages?page=&pageSize=` | cookie | Inbox page, newest first: `{ items: [{ id, name, receivedAt, isRead }], page, pageSize, totalCount }` (pageSize 1–50, default 10) |
| GET    | `/api/contact/messages/{id}` | cookie | One message `{ id, name, email, message, receivedAt, readAt }`, or **404**. Doesn't mark it read |
| POST   | `/api/contact/messages/{id}/read` | cookie | Marks it read (keeps the first read time): **204**, or **404** |
| GET    | `/api/about`                | public  | The About Me page (photo, links, skills, experience, education, papers, qualifications); placeholders until the first save |
| PUT    | `/api/about`                | cookie  | Replaces the whole page: **200** with it as stored (trimmed, experience/education sorted newest first), or **400** with field errors keyed by path (`experience[0].title`) |

## Authentication (Google, admin only)

Only the site owner signs in, to reach the future admin area. There are no public accounts.

**Flow** (server-side OAuth: tokens never reach the browser):

1. The visitor opens `/admin` and clicks **Sign in with Google**, a plain link to `/api/auth/login?returnUrl=/`.
2. The API challenges the Google handler, which redirects to Google (authorization code flow with PKCE, a `state` parameter and a correlation cookie).
3. Google redirects back to `/api/auth/signin-google`. ASP.NET Core exchanges the code and reads the email, name and picture.
4. `OnTicketReceived` checks the email against `Auth:AdminEmails`:
   - allowed: the API starts a new database session (see below), issues the `portfolio.auth` cookie (HttpOnly, SameSite=Lax, Secure outside Development) and redirects to `returnUrl` (the home page)
   - not allowed: no cookie; redirects to `/admin?error=not_authorized`
   - cancelled or failed on Google: redirects to `/admin?error=login_failed`
5. The frontend `AuthProvider` calls `/api/auth/me` on load. Signed in, the header shows "Signed in as ... · Sign out", the Contact tab shows the inbox instead of the form, and `/admin` redirects to `/`.

### Sessions (stored in the database)

There is exactly one admin, so there is exactly one session, stored on the profile row (`profiles.session_token_hash`, `profiles.session_expires_at`). The logic is in `AdminSessionService`.

- **Sign-in** creates a random 256-bit token. The encrypted cookie carries the token; the database stores only its SHA-256 hash and the expiry. Signing in again replaces it, so **signing in somewhere new signs you out everywhere else**.
- **Every request that carries the cookie** is validated against the database (`OnValidatePrincipal`): the token hash must match and the session must not have expired. Otherwise the request is anonymous and the cookie is cleared.
- **10-minute idle timeout** (`Auth:SessionIdleTimeout`, default `00:10:00`). Any request is activity: at most once a minute, the expiry is pushed to now + 10 minutes and the cookie is re-issued with the same expiry. So the session ends 10 minutes (±1 minute) after the last request.
- **Sign out** clears the database session, which **signs out every browser**. Anonymous calls to `/api/auth/logout` only clear their own cookie; they can't end the admin's session.
- **Frontend** (`src/auth/AuthProvider.tsx`): while signed in, clicks, key presses, scrolling and mouse movement call `/api/auth/me` (at most once a minute) to keep the session alive. A timer re-checks just after `sessionExpiresInSeconds`, so the UI shows you as signed out once the session ends. The expiry is sent as *seconds remaining*, not a timestamp, so the browser's clock doesn't matter.

Details:
- Removing an email from `Auth:AdminEmails` also kills existing sessions for it on the next request (`OnValidatePrincipal`).
- `returnUrl` must be a local path (`/...`); anything else falls back to `/` (no open redirects).
- API calls without a valid cookie get a plain **401** (or **403**), never a redirect to a login page.
- To protect a new endpoint, add `.RequireAuthorization()`.
- If Google credentials aren't configured, the API still runs and `/api/auth/login` returns **503**. This is how tests and CI run.
- Cookie encryption uses ASP.NET Core Data Protection. Locally keys live in your user profile. In production, persist the keys (e.g. to the database or a volume), or every deploy logs you out.

### Setting up Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or pick) a project.
2. **Google Auth Platform → Branding** (or "OAuth consent screen"): app name, support email, developer contact. Audience **External**. While in *Testing*, add your Google account under **Audience → Test users**.
3. **Google Auth Platform → Clients → Create client**, type **Web application**:
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URIs: `http://localhost:5173/api/auth/signin-google`
   - Later, for production, add `https://<your-domain>` and `https://<your-domain>/api/auth/signin-google`.
4. Store the credentials and your admin email as user secrets (never in appsettings):

   ```bash
   cd backend/src/Portfolio.Api
   dotnet user-secrets set "Authentication:Google:ClientId" "<client-id>.apps.googleusercontent.com"
   dotnet user-secrets set "Authentication:Google:ClientSecret" "<client-secret>"
   dotnet user-secrets set "Auth:AdminEmails:0" "<your-google-email>"
   dotnet user-secrets list
   ```

5. Restart the API, open http://localhost:5173/admin and sign in.

Production: set the same keys as environment variables (`Authentication__Google__ClientId`, `Authentication__Google__ClientSecret`, `Auth__AdminEmails__0`).

## Frontend: API service and auth state

### `api`: the single API service

Every backend call goes through the `api` object in `src/services/api.ts`, which uses one shared [axios](https://axios-http.com) instance. Components and hooks never call `fetch` or axios directly.

```ts
import { api } from '../services/api'

const firstName = await api.profile.getFirstName(signal)
const user = await api.auth.me()          // CurrentUser | null
await api.auth.logout()
<a href={api.auth.googleLoginUrl('/')}>  // navigation, not fetch
```

- Endpoints are grouped by backend feature (`api.auth`, `api.profile`, ...). A new endpoint goes into its group, or a new group mirroring `backend/.../Features/<Feature>`.
- Response types live in the same file, mirroring the backend records.
- Non-2xx responses throw `ApiError` (with `.status`; `0` when there was no response). Cancelled requests reject with axios's cancellation error, not an `ApiError`. Every call accepts an optional `AbortSignal`.

### Auth state: `useAuth()`, `<SignedIn>`, `<SignedOut>`

Import from `src/auth`. Works anywhere inside `<AuthProvider>` (wired up in `main.tsx`).

```tsx
import { SignedIn, SignedOut, useAuth } from '../auth'

const { isAuthenticated, isLoading, user, status, signOut } = useAuth()

<SignedIn>Only the admin sees this</SignedIn>
<SignedIn>{(user) => <span>Signed in as {user.email}</span>}</SignedIn>
<SignedOut>Only visitors see this</SignedOut>
```

- `status` is `'loading' | 'anonymous' | 'authenticated'`. While `loading` (the first `/api/auth/me` check), **neither** `<SignedIn>` nor `<SignedOut>` renders, so the UI never flashes the wrong state.
- It stays up to date on its own: it signs out in the UI when the session expires, and after `signOut()`.
- This is for **display only**. The API enforces access (`.RequireAuthorization()`); hiding a button is never the security boundary.

## Site sections and the contact feature

The site is a header (greeting, plus the session bar when signed in) above five tabs, each a route rendered inside `src/layout/AppLayout.tsx`:

| Tab | Route | Status |
| --- | --- | --- |
| What's new? | `/` | placeholder |
| Apps | `/apps` | my apps in a grid, each with a popup; the admin adds and edits them |
| YouTube | `/youtube` | my videos, 9 a page |
| About Me | `/about` | profile, where I've been (map), problem solving (LeetCode, NeetCode), skills timeline, experience, education, papers, qualifications, languages, licences, hackathons; editable by the admin |
| Contact | `/contact` | contact form / admin inbox |

**Apps** (`src/pages/AppsPage.tsx`, `src/features/apps/`, API in `backend/.../Features/Apps/`):

- The same paged 3 × 3 grid as YouTube, newest first. A tile shows the app's first image (whatever comes before it), its title and the start of its description. Clicking it opens a popup with every image and video in a sideways slider (swipe, arrows, dots or the arrow keys; moving on pauses a video) and the full description, which may hold `[text](url)` links.
- **The admin** gets an **Add an app** tile first (the first page then holds 8 apps, so it stays 3 × 3), and an **Edit** button in each popup that turns it into the form used for adding: title, description, and the images and videos, which can be added several at once, moved left or right, and removed. Closing with unsaved changes asks first. **Delete app** asks too.
- `GET /api/apps` (public), `POST /api/apps`, `PUT /api/apps/{id}`, `DELETE /api/apps/{id}` (admin), stored in the `apps` table (media as `jsonb`). `POST /api/files/app-media` takes one file: images (JPEG, PNG, WebP, GIF up to 15 MB) become a WebP of at most 1920 px without metadata; videos (MP4, MOV, WebM up to 200 MB, recognised by their first bytes) are kept as they are. Files are served with range requests, so videos can start before they're fully downloaded (Safari needs this).
- Saving About Me or an app deletes uploads that **nothing** uses any more, once a day old (`FileCleanup.cs`).
- Videos live in the database like every other upload and are read whole for each request. That's fine for a few short clips; for many or long videos, move `IFileStorage` to object storage (R2, S3) or link YouTube videos instead.

**YouTube** (`src/pages/YouTubePage.tsx`, API in `backend/.../Features/YouTube/`): the channel's public videos, newest first, in a 3 × 3 grid (2 columns on tablets, 1 on phones). Each card shows the thumbnail, title, date and the start of the description (cut after three lines), and opens the video on YouTube in a new tab. More than 9 videos get Previous / Next, with the page in the URL (`?page=2`).

- `GET /api/youtube/videos?page=1&pageSize=9` (public) reads the uploads with the YouTube Data API v3. It needs `YouTube:Channel` (`@handle` or `UC…` id) and `YouTube:ApiKey`; until both are set it answers 503 and the page says the videos can't be loaded.
- The list is cached in memory for an hour (`RefreshingCache<T>`, a small reusable cache: one fetch at a time, keeps the last list if YouTube fails and retries after 5 minutes). Each refresh costs about 2 units of the free 10,000 a day.
- **Reusable for Apps:** `src/components/PagedGrid.tsx` (loads a page with a `load(page, pageSize, signal)` function, shows loading / empty / error, and the pagination) and `src/components/MediaCard.tsx` (image, title, meta line, clamped description; the whole card is a link). `Pagination.tsx` and `usePageParam.ts` are shared with the contact inbox.

To fill a section, replace its `<PlaceholderPage>` in `src/App.tsx` with a real page. Unknown URLs redirect to `/`.

**Contact** (`src/pages/ContactPage.tsx`, `src/features/contact/`):

- **Visitors** (`<SignedOut>`) get a form: name (max 100), email, and a message of **100 to 1000 characters**, counted after trimming. Errors appear after the first submit and then update as you type. The rules are in `contactRules.ts`, mirroring the API's `ContactRules.cs`. The API has the final say, and its field errors are shown on the matching fields.
- **The admin** (`<SignedIn>`) gets the inbox: a table of name and date received, 10 per page (the page is in the URL, `?page=2`). Unread messages are bold, with a blue dot. Clicking a row opens a popup with every field and a **Copy** button for each, and marks the message as read.
- Each detail has a copy-to-clipboard icon button (`src/components/CopyButton.tsx`); the icons are in `src/components/icons.tsx`.
- **Deleting:** each row has a trash button, and the popup a **Delete** button (`DELETE /api/contact/messages/{id}`, admin only). Both ask first.
- The popup is `src/components/Modal.tsx`: it keeps focus inside (Tab wraps), closes with Escape, the × button or a click on the backdrop, and returns focus to the row's button. Keys and clicks inside a dialog stay inside it, so a dialog opened from another (or from a table row) behaves: Escape closes only the top one.
- **Confirming:** `src/components/DeleteButton.tsx` is the one delete button for the whole site: it opens `ConfirmDialog` ("Delete …?" with Cancel focused) and only then runs `onDelete`. If that is async, the popup waits and says so when it fails. About Me uses it with `action="Remove"` for every remove button, explaining that nothing is lost until the section is saved.

**About Me** (`src/pages/AboutPage.tsx`, `src/features/about/`, API in `backend/.../Features/About/`):

- The page is **one JSON document** (`AboutContent`), stored in the `about_page` table (`jsonb`, one row). It's always read and saved whole, so changing its shape means changing `AboutContent.cs` and the matching types in `api.ts`, with no new migration. Until the first save, `GET` returns `AboutDefaults` (placeholders).
- **Sections:**
  - **Photo and links:** an uploaded photo (or a placeholder icon) on top, then citizenship and residence labels (`statuses`: text and a flag each, e.g. 🇬🇧 "UK Settled Status"; the editor guesses the flag from the words; with none, only the admin sees a hint where they go), then an uploaded résumé (download button) and GitHub, LeetCode (when a username is set under Problem solving), LinkedIn and Instagram in their brand colours. An empty link is hidden.
  - **Where I've been:** a dotted world map with a pin per city. Each city is marked *worked*, *studied* and/or *visited*, each with an optional note. A pin with several marks is split into equal slices, one colour each. Hovering, focusing or tapping a pin shows its notes. Zoom with the buttons, a pinch, or Ctrl/⌘ + scroll; drag to move.
  - **Problem solving:** LeetCode stats (solved problems, split into Easy, Medium and Hard, out of all on LeetCode) for the username the admin sets (pasting the profile link works too), and the NeetCode lists completed (Blind 75, NeetCode 150, NeetCode 250), switched on and off like licences and shown as labels. NeetCode has no public API, so those are ticked by hand.
  - **Skills:** a timeline. Each skill has periods, each used for *work*, *academic* and/or *personal* (several split the bar into bands). The years of experience are worked out from the periods, counting overlaps once. A skill without periods is listed without a bar. **Sort by experience** orders them by total time (applies on Save, like the sort below).
  - **Work experience:** title, company, optional location, start month (may be in the future), an end month or *ongoing*, and bullet points.
  - **Education:** the same, without bullet points.
  - **Academic papers:** a title and an uploaded PDF each. With a PDF, the title is a download link with a download icon.
  - **Qualifications:** a title, and optionally the issuer, the month obtained and a grade.
  - **Languages:** a name and a level (native, fluent, advanced, intermediate, beginner), shown as a word and five steps.
  - **Licences:** driving, flying and boating licences, shown as rounded labels grouped by kind. The admin clicks the ones they have from a built-in list (`licences.ts`: EU/UK driving categories, drone and pilot licences, boating certificates) and can add others by hand.
  - **Hackathons:** name, year and bullet points; reorderable, with **Sort by year**.
- **Colours:** the admin picks the legend colours (skill uses, map marks) with colour pickers. They're stored in the page (`colors`).
- **Collapsing:** every section has a chevron that folds it down to its heading. It's for visitors too, and is remembered per section in that browser (`localStorage`). Editing a collapsed section opens it.
- **Editing:** when signed in, each section has an **Edit** button that turns it into a form; **Save** sends the whole page with that section changed. The API validates everything (`AboutRules.cs`), trims text and drops empty bullets. The page then shows what the API stored. Field errors come back keyed by path and show under the matching input. Since the whole page is sent, a problem in another section also blocks the save: the message then names that section and item (`errorKeys` on `EditableSection` says which keys a section shows itself).
- **Order:** every list is shown in the order the admin set, with the arrow buttons. Experience and education also have **Sort by end date** (ongoing first, then the latest end): it only reorders the form, so Save keeps it and Cancel undoes it.
- **Links in text:** any text field can hold `[text](https://…)` links, e.g. a company written as `[Acme](https://acme.example)`. The **Add link** button under a field writes one at the cursor. Only http(s) links and paths on this site become links (`textLinks.ts`, and `AboutRules.LinksIn` on the API).
- **Older pages:** `AboutJson.cs` upgrades a page saved in an older shape when it's read (0–100 skill levels are dropped, qualifications as plain text get no date, a company or institution website becomes a link in its name), so changing the shape needs no data migration. Whatever it produces must pass `AboutRules`, or no section could be saved.
- **Links** must be `http(s)://…` or a path on this site (`/resume.pdf`), checked by the API and again before rendering, so a stored value can never become a `javascript:` link.
- Dates are months, stored as the 1st (`2023-01-01`). The month picker is a select plus a year box, because desktop Safari and Firefox don't support `<input type="month">`.

**Uploaded files** (`backend/.../Features/Files/`):

- `POST /api/files/photo`, `POST /api/files/resume` and `POST /api/files/paper` (admin, multipart field `file`) return `{ url, fileName }`. The editor puts the URL in the page; it's used once the section is saved.
- Photos (JPEG, PNG, WebP or GIF, up to 15 MB) are turned upright, scaled to fit 800×800 and stored as WebP **without metadata**, so a phone photo's GPS position never reaches the site. Résumés (up to 20 MB) and papers (up to 200 MB) must be PDFs and keep their file name.
- Each upload endpoint reads its own form and raises the server's request limit (Kestrel's default is 30 MB) for that request only. The editor checks the size before sending and shows the upload's progress. Limits are in `FileRules.cs` and `uploadLimits.ts`.
- Files are served publicly from `GET /api/files/{id}/{name}`. Saving the page or an app deletes uploads nothing uses any more once they're a day old (a replaced photo, or one uploaded and never saved).
- Storage is behind `IFileStorage`. `DatabaseFileStorage` keeps files in the `stored_files` table, which suits a photo and a PDF. Moving to object storage (Cloudflare R2, S3) means a new implementation and one line in `Program.cs`. There's no HTTP caching yet; adding a CDN later only needs cache headers, since a file's URL never changes.
- Image processing uses SixLabors.ImageSharp 3.1 (Six Labors Split License: free for open source and for individuals or companies under $1M revenue; version 4 needs a license key). Advisories published in October 2026 (fixed only in 4.1.2+) affect TIFF, ICC-profile and histogram code: photos are only read as JPEG, PNG, WebP or GIF, and only the admin can upload. Moving to ImageSharp 4 (with a license key) or to SkiaSharp would clear them.
- Flags come from the `flag-icons` package (MIT), as separate SVG files loaded when shown (`features/about/flags.ts`).

**LeetCode stats** (`backend/.../Features/LeetCode/`): `GET /api/leetcode` (public) returns the stats of the username saved on the page, and only that one, so the API can't be used to look anyone up. It returns 204 when no username is set, 404 when LeetCode has no such user, and 503 when LeetCode can't be reached and nothing was saved yet. The numbers come from LeetCode's GraphQL endpoint (`https://leetcode.com/graphql`), the one its own profile page uses: it needs no key, but it isn't an official API and may change. They're **cached** so visitors don't each trigger a call:

1. **In memory** (`LeetCodeMemoryCache`, a singleton): answers instantly for 24 hours. Lost on restart.
2. **In PostgreSQL** (`leetcode_stats`, one row per username): survives restarts and is the fallback. If LeetCode fails, the last saved numbers are shown (the page adds "As of <date>" once they're over 48 hours old) and LeetCode is tried again after 15 minutes.

Only one refresh runs at a time (`RefreshLock`), so visitors arriving together cause a single call. The times are in `LeetCodeStatsService.cs`. Tests replace `ILeetCodeClient` with a fake, so they never call leetcode.com.

**City search** (`backend/.../Features/Places/`): `GET /api/places/search?q=manch` (admin) searches every place with 1,000+ people (~170k, from [GeoNames](https://www.geonames.org), CC BY 4.0) by the start of its name, largest first, ignoring accents. Text after a comma narrows by region or country (`manchester, new hampshire`). The list is `cities.tsv.gz`, embedded in the API and built by `python3 scripts/build_cities.py`.

**The map's dots** are generated once by `node scripts/build-world-dots.ts` (in `frontend/`) from Natural Earth land shapes into `src/features/about/places/worldDots.ts`. Pins use the same projection (`projection.ts`), so they line up.

## Configuration

Backend settings live in `backend/src/Portfolio.Api/appsettings*.json` and can be overridden with environment variables (`__` as separator, e.g. `ConnectionStrings__Default`).

| Key                           | Purpose                                                      |
| ----------------------------- | ------------------------------------------------------------ |
| `ConnectionStrings:Default`   | Npgsql connection string                                     |
| `Database:MigrateOnStartup`   | Apply pending EF migrations on startup (`true` in Development) |
| `Authentication:Google:ClientId` / `ClientSecret` | Google OAuth client (secret; user-secrets or env vars). Google sign-in is disabled when empty |
| `Auth:AdminEmails`            | Array of Google emails allowed to sign in                    |
| `Auth:SessionIdleTimeout`     | Admin session idle timeout (default `00:10:00`)              |
| `YouTube:Channel`             | The channel shown on the YouTube page: `@handle` or `UC…` id  |
| `YouTube:ApiKey`              | YouTube Data API v3 key (secret; user-secrets or env vars). Videos aren't shown when empty |

Secrets are never committed. Locally, use [user secrets](https://learn.microsoft.com/aspnet/core/security/app-secrets):
`dotnet user-secrets set "<Key>" "<value>" --project backend/src/Portfolio.Api`.

## Database and migrations

- Schema is managed by EF Core migrations in `backend/src/Portfolio.Api/Data/Migrations`.
- Table and column names are snake_case (configured in `PortfolioDbContext`).
- Seed data uses `HasData(...)` in `PortfolioDbContext`, so it ships with migrations.

```bash
# Add a migration after changing entities/DbContext
dotnet ef migrations add <Name> -p backend/src/Portfolio.Api -o Data/Migrations

# Apply manually (otherwise it's done on API startup in Development)
dotnet ef database update -p backend/src/Portfolio.Api

# Reset the local database completely
docker compose down -v && docker compose up -d --wait

# psql into the local database
docker exec -it portfolio-db psql -U portfolio -d portfolio
```

## Testing

### Backend (`backend/`)

| Project                          | Type        | How                                                         |
| -------------------------------- | ----------- | ----------------------------------------------------------- |
| `Portfolio.Api.UnitTests`        | Unit        | xUnit; calls endpoint handlers directly with the EF InMemory provider |
| `Portfolio.Api.IntegrationTests` | Integration | xUnit + `WebApplicationFactory<Program>`; spins up a throwaway `postgres:16-alpine` container via Testcontainers (one shared by all test classes via `ApiCollection`), runs migrations, sends real HTTP requests. **Needs Docker running.** |

Auth in integration tests: `PortfolioApiFactory` configures dummy Google credentials and `Auth:AdminEmails = admin@example.com`. A test-only `GET /test/sign-in?email=...` hook (registered via `IStartupFilter`) does what the Google callback does after a successful login: it starts the database session and issues the real cookie. So tests exercise the real cookie and session validation. The API's clock is a `FakeTimeProvider` (`factory.Time`); advance it to simulate idle time.

```bash
cd backend
dotnet test                                            # everything
dotnet test tests/Portfolio.Api.UnitTests              # unit only
dotnet test tests/Portfolio.Api.IntegrationTests       # integration only
```

### Frontend (`frontend/`)

| Command                 | What it runs                                                        |
| ----------------------- | ------------------------------------------------------------------- |
| `npm test`              | Vitest in watch mode (unit + component tests)                       |
| `npm run test:run`      | Vitest once                                                         |
| `npm run test:coverage` | Vitest with v8 coverage (report in `coverage/`)                     |
| `npm run test:e2e`      | Playwright full-stack E2E                                           |
| `npm run test:e2e:ui`   | Playwright UI mode                                                  |
| `npm run lint`          | oxlint                                                              |
| `npm run typecheck`     | `tsc -b`                                                            |

To run the E2E tests while your usual dev servers keep running, give them other ports and a separate database, e.g.
`API_PORT=5205 WEB_PORT=5273 ConnectionStrings__Default="Host=localhost;Port=5433;Database=portfolio_e2e;Username=portfolio;Password=portfolio" npm run test:e2e`.
Vite also reads `WEB_PORT` and `API_URL` (where to proxy `/api`).

- **Unit/component tests** live next to the code as `*.test.ts(x)`, run in jsdom, and mock HTTP with MSW. The default handlers in `src/test/server.ts` cover the happy path for an **anonymous** visitor; use `server.use(signedIn())` for a signed-in admin, or `server.use(...)` for other overrides. Unhandled requests fail the test. `renderApp(url)` in `src/test/render.tsx` renders the full app (router + auth) at a URL.
- The real Google round-trip isn't automated. E2E tests cover the `/admin` page and fake a signed-in session with `page.route('**/api/auth/me', ...)`. The admin inbox E2E tests (`e2e/contact.spec.ts`) fake the inbox endpoints the same way. The visitor tests send real messages, so the local database collects a few `E2E visitor ...` rows.
- For the inbox in component tests, `inbox(makeMessages(n))` in `src/test/server.ts` gives MSW handlers over an in-memory list that supports paging and marking messages as read.
- **E2E tests** live in `e2e/`. Playwright starts the real API and the Vite dev server itself (or reuses ones already running locally). The database must be running (`docker compose up -d --wait`). First run: `npx playwright install`.
- Browsers: Chromium and WebKit locally. **Firefox runs only in CI** because Playwright's Firefox build currently fails to launch on macOS 27 ("Could not find profile folder"). Try removing the `process.env.CI` guard in `playwright.config.ts` after a Playwright upgrade.

## CI

`.github/workflows/ci.yml` runs on pushes to `develop`/`main` and on every PR:

1. **backend**: restore, build, `dotnet test` (Testcontainers uses the runner's Docker)
2. **frontend**: `npm ci`, lint, build (includes typecheck), Vitest with coverage
3. **e2e** (after both pass): PostgreSQL service container on 5433 + Playwright on Chromium, WebKit and Firefox. The HTML report is uploaded as an artifact on failure.

## Conventions

- Git: `develop` is the main branch. Work happens on `feature/*` / `chore/*` branches, merged into `develop`.
- Backend: all routes under `/api`; minimal APIs grouped per feature (`Features/<Feature>/<Feature>Endpoints.cs` with a `Map<Feature>Endpoints` extension). Handlers are public static methods with typed results (`Results<Ok<T>, NotFound>`), so unit tests can call them directly.
- Frontend: all HTTP goes through the `api` object in `src/services/api.ts`; auth-dependent UI uses `useAuth()` / `<SignedIn>` / `<SignedOut>` from `src/auth`. Routes are declared in `src/App.tsx` (React Router), with one page component per route in `src/pages/`.

## Troubleshooting

- **Integration tests fail with a Docker socket error**: start Docker Desktop.
- **`Port 5173 is already in use`**: another Vite instance is running; stop it (the port is strict so E2E and the backend config stay predictable).
- **Frontend shows the error message**: check the API is running on 5105 and the DB container is healthy (`docker compose ps`).
- **`[vite] http proxy error ... ECONNREFUSED`**: the page called `/api` while the API wasn't listening (not started yet, still building, or crashed). Check `curl localhost:5105/api/health`. The launcher's *Start website* waits for the API to avoid this.
- **`/api/auth/login` returns 503**: Google credentials aren't set; see [Setting up Google sign-in](#setting-up-google-sign-in).
- **Google says `redirect_uri_mismatch`**: the redirect URI registered in Google must exactly match `http://localhost:5173/api/auth/signin-google`. Open the site via 5173, not the API port.
- **Google says access blocked / app not verified**: while the consent screen is in *Testing*, only listed test users can sign in.
- **Redirected to `/admin?error=not_authorized`**: your email isn't in `Auth:AdminEmails` (`dotnet user-secrets list`).
- **Launcher: `No module named '_tkinter'`**: `brew install python-tk@3.14` (match your Python version).
