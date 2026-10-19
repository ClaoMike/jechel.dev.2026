# jechel.dev.2026

Personal portfolio website of Claudiu Mihai Jechel.

| Layer    | Stack                                                           |
| -------- | --------------------------------------------------------------- |
| Frontend | React 19 + Vite 8 + TypeScript (`frontend/`)                    |
| Backend  | .NET 10 minimal API + EF Core 10 + Npgsql (`backend/`)          |
| Database | PostgreSQL 16 (Docker Compose for local dev)                    |
| State    | Redux Toolkit + RTK Query; views in MVVM (View + `*.viewModel.ts`) |
| Tests    | Backend: xUnit, Testcontainers. Frontend: Vitest in headless Chromium (coverage, screenshots) |
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
│   │   ├── store/                         # the Model: Redux store, slices, RTK Query endpoints (store/api/)
│   │   ├── auth/                          # useAuth, useSessionKeeper, <SignedIn>/<SignedOut> (state in store/authSlice)
│   │   ├── layout/                        # site frame: greeting, session bar, section tabs
│   │   ├── pages/                         # one folder per route: X/X.tsx + X/X.viewModel.ts
│   │   ├── features/<feature>/            # a feature's components and rules (e.g. contact form + inbox)
│   │   └── components/                    # shared UI: Modal, CopyButton, icons
├── scripts/dev_launcher.py                # GUI launcher for common dev tasks (macOS)
├── scripts/build_brand_j.py               # draws the "j": the Vice title's first letter and the tab icon
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
| Redis       | localhost:**6380**         | 6380, not 6379, for the same reason. Optional: the API caches in memory without it |
| OpenAPI doc | http://localhost:5105/openapi/v1.json | Development only                        |

Local DB credentials (dev only): database/user/password all `portfolio`.

## Running locally

```bash
# 1. Database (and Redis, the API's optional cache)
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
| Run frontend tests | `npm test` in `frontend` (all tests, with coverage), then opens the coverage report in the browser |

The first click may trigger a macOS prompt to allow Terminal automation; allow it.

## API conventions

- **Every endpoint lives under `/api`** (`app.MapGroup("/api")` in `Program.cs`). Feature endpoint files map *relative* routes onto that group.
- The frontend always calls relative `/api/...` URLs, through `src/services/api.ts` (see [Frontend conventions](#frontend-api-service-and-auth-state)). In dev the Vite proxy forwards them to the API, so browser, cookies and API share one origin (no CORS). Production should do the same: serve the SPA and route `/api` to the API on one domain.
- The Vite proxy sends `X-Forwarded-Host/Proto` (`xfwd: true`) and the API runs `UseForwardedHeaders()`, so URLs the API generates use `localhost:5173`, the origin the browser sees. By default only loopback proxies are trusted; configure `KnownProxies`/`KnownNetworks` when deploying behind a real proxy.

| Method | Route                       | Auth    | Description                                        |
| ------ | --------------------------- | ------- | -------------------------------------------------- |
| GET    | `/api/health`               | public  | `Healthy` when the API can reach the database (used by the launcher) |
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
| GET    | `/api/terms`                | public  | The terms and conditions `{ title, intro, sections: [{ heading, blocks: [{ kind: paragraph\|bullets, text, items }] }], updatedAt }`; defaults with `updatedAt: null` until the first save |
| PUT    | `/api/terms`                | cookie  | Replaces the terms: **200** with them as stored (trimmed, new `updatedAt`), or **400** with field errors keyed by path (`sections[0].blocks[1].items[2]`) |
| POST   | `/api/analytics/events`     | public  | A batch of a visit's events `{ sessionId, session, events }`: always **204** (the admin, bots and repeats aren't stored), **400** without `sessionId` |
| GET    | `/api/analytics/summary?range=` | cookie | Totals, the chart's columns (`series`, sized by `bucketSize`) and top-10 lists for `range`: `1h`, `24h`, `7d`, `30d` (default), `90d`, `1y`, `5y` or `all` |
| GET    | `/api/analytics/sessions?page=&pageSize=&errorsOnly=` | cookie | Visits, newest first (pageSize 1–50, default 20) |
| GET    | `/api/analytics/sessions/{id}` | cookie | One visit with every event in order, or **404** |
| DELETE | `/api/analytics/sessions/{id}` | cookie | Deletes the visit and its events: **204**, or **404** |
| GET    | `/api/support`              | public  | `{ url }`: where the header's **Buy me a coffee** goes (`Support:Url`); `""` hides it |
| POST   | `/api/support/buymeacoffee` | signature | Buy Me a Coffee's webhook (HMAC-SHA256 of the body in `X-Signature-Sha256` or `X-Bmc-Signature`): stores the payment once, alerts the phone. **401** for a bad signature, **503** until the webhook secret is set |
| GET    | `/api/support/donations?page=&pageSize=` | cookie | Donations, newest first |
| POST   | `/api/updates/subscribe`    | public  | `{ email }`: **200** `{ status }`: `sent` (a confirmation link is on its way), `alreadySubscribed`, or `pending` (one went out less than 10 minutes ago). **400** field error, **429** after 5 tries per IP in 10 minutes, **503** when the email couldn't be sent (and the phone is told why) |
| POST   | `/api/updates/confirm?token=` | public | Confirms: **200** `{ email }`, or **404** |
| POST   | `/api/updates/unsubscribe?token=` | public | Deletes the subscriber: always **204** (also what mail apps' one-click Unsubscribe posts) |
| GET    | `/api/updates/subscribers?page=&pageSize=` | cookie | Subscribers, newest first, with `confirmedAt` |
| DELETE | `/api/updates/subscribers/{id}` | cookie | **204**, or **404** |
| GET    | `/api/updates/announcements?page=&pageSize=` | cookie | Update emails, newest first, with their `status` (`pending`, `approved`, `sent`, `ignored`) |
| POST   | `/api/updates/announcements/{id}/send?token=` | cookie or token | Approves a pending one (emailed at once): **200** `{ status }`. The phone alert's button sends the token |
| POST   | `/api/updates/announcements/{id}/ignore?token=` | cookie or token | Ignores a pending one |
| GET    | `/api/resume?inline=`       | public  | The last generated résumé **without** the phone number (PDF), or **404** |
| GET    | `/api/resume/private?inline=` | cookie | The same **with** the phone number |
| GET    | `/api/resume/settings`      | cookie  | `{ phone, email, headline, sections, excludedSkills, generatedAt }` |
| PUT    | `/api/resume/contact`       | cookie  | `{ phone, email, headline }` (edited with About Me's profile): **200**, or **400** with field errors |
| PUT    | `/api/resume/choices`       | cookie  | `{ sections, excludedSkills }` without generating: **200**, or **400** |
| POST   | `/api/resume/generate`      | cookie  | `{ sections, excludedSkills }`: saves them, makes both PDFs, and points About Me's résumé link at the public one: **200**, or **400** |
| GET    | `/api/meetings/info`        | public  | `{ calLink }`: the Cal.com booking page ("user/event") for **Book a meeting**, or `""` |
| POST   | `/api/meetings/cal`         | signature | Cal.com's webhook (HMAC-SHA256 of the body, hex, in `x-cal-signature-256`): keeps bookings up to date, alerts the phone. **401** bad signature, **503** until the secret is set |
| GET    | `/api/meetings?from=&to=`   | cookie  | Meetings overlapping the range (a calendar month), soonest first |
| POST   | `/api/meetings/{id}/accept` | cookie or token | `{ message? }`: confirms a requested meeting with Cal.com and emails the message: **200** `{ status, emailSent }`, **502** when Cal.com refuses |
| POST   | `/api/meetings/{id}/decline` | cookie or token | The same, declining (the message is also Cal.com's reason) |
| POST   | `/api/contact/messages/{id}/reply` | cookie | `{ text }`: emails the answer to the sender (their message quoted, your address to reply to): **200**, **400**, **503** when it can't be sent |
| GET    | `/api/site`                 | public  | What visitors see: `{ pages, features, maintenance, maintenanceMessage }` (cached: memory, then Redis) |
| PUT    | `/api/site`                 | cookie  | Changes what's given (pages, features, maintenance, its message): **200**, or **400** for unknown ids |
| GET    | `/api/settings`             | cookie  | The connection settings (secrets only as set/not set and their last 4 characters), how Google sign-in is set up, and the site's address |
| PUT    | `/api/settings/{key}`       | cookie  | `{ value }`: saves one (encrypted if secret) and applies it at once; `""` clears it. **400** for a bad value, **404** for an unknown key |
| POST   | `/api/settings/test/{service}` | cookie | `ntfy` (test alert), `email` (test email to you) or `youtube` (lists the videos): **200** `{ ok, message }` |

## The "j" (Vice title and tab icon)

Mr Dafoe's own j has a long, thin tail loop that closes up when small (in a browser tab it looked like a
banana), so the site draws its own: `scripts/build_brand_j.py` traces a brush stroke (thick going down,
thin going up, with a wide, open loop) in the font's units and writes two weights of it:

- `frontend/src/assets/brand-j.svg`: the Vice title's j. `glass.css` (`.brand-j::before`) masks the neon gradient and the purple shadow layer with it, where the font's j would be; the letter stays in the page (at size 0) and the title link is named "jechel.dev", so screen readers still read the name. Other themes show the plain j.
- `frontend/public/favicon.svg`: the tab icon, a bolder j on a dark tile. `favicon.ico` (16, 32, 48 px, for Safari and old browsers) and `apple-touch-icon.png` (180 px) are renders of it.

After changing the drawing, re-run the script, re-render the PNG copies (e.g. a Playwright screenshot of
favicon.svg), update the bounds in `.brand-j::before` if the script prints new ones, and bump the `?v=`
on the icon links in `index.html` (browsers keep tab icons cached).

## Terms and conditions

- **Welcome popup:** a visitor who hasn't accepted the terms (anywhere but the sign-in page, `/admin`) gets a popup that can't be closed: they tick every box (placeholders for now, in `features/terms/TermsGate/TermsGate.tsx`), then **Continue**. Accepting is remembered in the browser (`localStorage["terms.accepted"]`) against the terms' `updatedAt`, so saving new terms asks everyone again. The signed-in admin isn't asked.
- **Reading them:** the footer on every page, and the welcome popup, have a **Terms and Conditions** link that opens them in a popup above anything else that's open.
- **Editing them:** the admin's last tab, **Terms**, shows them as a page with an **Edit** button: title, introduction, and numbered sections of paragraphs and bullet lists (add, reorder, remove). Text may contain `[text](https://…)` links.
- **E2E:** the `setup` project (`e2e/terms.setup.ts`) accepts the terms once and the other projects start from that browser state; tests of the popup itself use a fresh state.

## Engagement (visitor analytics)

The site records how it's used itself: no third parties, no cookies. The admin reads it in the **Engagement** tab.

**Recording** (`src/features/analytics/tracker.ts`, mounted by `<AnalyticsTracker>` in `App/App.tsx`):

- **What:** pages opened (with the query), clicks on buttons, links and fields (the label the visitor saw, plus a link's address; **never what was typed**), Escape, the site's own events (`trackEvent('Message sent')`, `'Terms accepted'`, `'Contact form invalid'` with the field names), leaving the tab, and every **error**: script errors with file, line and stack, unhandled promise rejections, React crashes with the component stack (`createRoot` callbacks in `main.tsx`), requests that fail with 5xx or no answer (`onRequestFailed` in `api.ts`; 4xx answers are expected and skipped), and images or files that didn't load.
- **A visit** is a browser tab: a random id in `sessionStorage`, so it survives reloads and ends with the tab. It starts with the page, the referring site (host and path; no query), `utm_*` tags, language, time zone, screen and window size, and theme.
- **Theme:** a visit keeps the theme it started in (Vice for first-time visitors, their earlier choice for those coming back) and the one it ended in: every batch says the theme on show, and the last is sent as the tab closes. Each switch is a `Theme changed` event with `from` and `to`.
- **Who isn't recorded:** the signed-in admin (the tracker waits for the sign-in check, and the API ignores requests with the admin cookie), and bots and headless browsers (by User-Agent, which includes the Playwright runs).
- **Sending:** batches every 5 seconds, and `sendBeacon` when the tab is hidden or closed. Limits: 1,000 events per page load, the same error 5 times, and the API stops a visit at 2,000.
- **Unique visitors without cookies:** the API hashes IP + User-Agent with a random salt that changes every UTC day and is never stored (`VisitorHasher`), like Plausible. The same person counts once a day, can't be followed across days, and no IP is stored. A restart picks a new salt, so someone may count twice that day.

**Storage:** `visit_sessions` (one row per visit, with counters) and `visit_events` (one row per event, `detail` as `jsonb`; unique on visit + sequence number, so a batch sent twice is stored once). Deleting a visit deletes its events. There is no automatic clean-up yet.

**The tab** (`src/pages/EngagementPage/EngagementPage.tsx`, `src/features/analytics/`): a period of 1 hour, 1 day, 7 / 30 / 90 days, 1 year, 5 years or all time, with
- counters: visitors, visits, page views, average visit, bounce rate (one page and no clicks), errors
- visitors, page views or errors as a column chart, one column per 5 minutes (1 hour), hour (1 day), day (7 to 90 days), month (1 and 5 years; all time) or year (all time beyond 6 years). Columns are aligned in UTC (`AnalyticsRange.cs`); "1 hour" and "1 day" are rolling. Visits count when they started, page views and errors when they happened. Hover a column for its number; a hidden table gives screen readers the same
- top pages, where visitors come from, most clicked, errors, **preferred theme** (the one visits ended in), **theme switches** ("vice → dark"), devices, browsers, time zones
- every visit (optionally only those with errors). One opens its timeline: what it ran on, then each step with its time, errors with their stack. **Copy steps to reproduce** gives it all as text, for an issue or an AI. Visits can be deleted.

Summaries are worked out in memory from the period's rows: plenty for a personal site; move the grouping into SQL if traffic grows a lot.

**Privacy:** the terms (Terms tab) should say what's recorded. Cookieless counting of totals is generally treated as low-risk under UK PECR/GDPR, but the visit id in `sessionStorage` and the replay of clicks are worth stating.

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
5. The frontend (`useSessionKeeper`, into the store's `auth` slice) calls `/api/auth/me` on load. Signed in, the header shows "Signed in as ... · Sign out", the Contact tab shows the inbox instead of the form, and `/admin` redirects to `/`.

### Sessions (stored in the database)

There is exactly one admin, so there is exactly one session, stored on the profile row (`profiles.session_token_hash`, `profiles.session_expires_at`). The logic is in `AdminSessionService`.

- **Sign-in** creates a random 256-bit token. The encrypted cookie carries the token; the database stores only its SHA-256 hash and the expiry. Signing in again replaces it, so **signing in somewhere new signs you out everywhere else**.
- **Every request that carries the cookie** is validated against the database (`OnValidatePrincipal`): the token hash must match and the session must not have expired. Otherwise the request is anonymous and the cookie is cleared.
- **10-minute idle timeout** (`Auth:SessionIdleTimeout`, default `00:10:00`). Any request is activity: at most once a minute, the expiry is pushed to now + 10 minutes and the cookie is re-issued with the same expiry. So the session ends 10 minutes (±1 minute) after the last request.
- **Sign out** clears the database session, which **signs out every browser**. Anonymous calls to `/api/auth/logout` only clear their own cookie; they can't end the admin's session.
- **No answer isn't "signed out":** only the API's answer decides (signed in, or 401). If the first check gets no answer (the API
  down or restarting, a network error, a 5xx), the page keeps waiting and asks again (after 2, 4, 8, then every 15 seconds), so
  restarting the API doesn't sign the admin out of an open page.
- **Frontend** (`src/auth/useSessionKeeper.ts`): while signed in, clicks, key presses, scrolling and mouse movement call `/api/auth/me` (at most once a minute) to keep the session alive. A timer re-checks just after `sessionExpiresInSeconds`, so the UI shows you as signed out once the session ends. The expiry is sent as *seconds remaining*, not a timestamp, so the browser's clock doesn't matter.

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

Import from `src/auth`. The session lives in the Redux store (`store/authSlice.ts`); `useSessionKeeper()` (called once, by App's view model) checks it on load, extends it on activity and signs out in the UI when it ends.

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

The site is a header (for the admin, a bar on top with who's signed in and **Sign out**; then the name, **Buy me a coffee**, **Get updates** and the theme switch) above five tabs (nine for the signed-in admin), each a route rendered inside `src/layout/AppLayout/AppLayout.tsx`:

| Tab | Route | Status |
| --- | --- | --- |
| What's new? | `/` | the newest app or video, in full |
| Apps | `/apps` | my apps in a grid, each with a popup; the admin adds and edits them |
| YouTube | `/youtube` | my videos, 9 a page |
| About Me | `/about` | profile, where I've been (map), problem solving (LeetCode, NeetCode), skills timeline, experience, education, papers, qualifications, languages, licences, hackathons; editable by the admin |
| Contact | `/contact` | contact form / admin inbox |
| Engagement | `/engagement` | admin only: how visitors use the site, and every visit replayable to reproduce errors (see [Engagement](#engagement-visitor-analytics)); visitors who open the URL go to `/` |
| Community | `/community` | admin only: email subscribers, the update emails (new apps wait here to be sent or ignored), and coffees (see [Email updates](#email-updates) and [Buy me a coffee](#buy-me-a-coffee-donations)) |
| Terms | `/terms` | admin only: the terms and conditions, editable (see [Terms and conditions](#terms-and-conditions)) |
| Settings | `/settings` | admin only: the services the site connects to (folded, each with how far it's set up), their links and keys, with test buttons (see [Settings](#settings-connections)) |
| (no tab) | `/updates/confirm`, `/updates/unsubscribe` | where the links in update emails land |

**What's new?** (`src/pages/WhatsNewPage/WhatsNewPage.tsx`): the newest app (by when it was added) or YouTube video (by when it was published), whichever came last, shown in full. An app gets the popup's view (`AppDetailsView`: slider, labels, description, platforms, store links). A video gets YouTube's player (from `youtube-nocookie.com`, which sets no cookies until it's played), its full description with web addresses as links (`utils/linkify.ts`), and a **Watch on YouTube** button. It only asks the API for the first item of each list; if one fails (e.g. YouTube isn't set up), the other is shown.

**Apps** (`src/pages/AppsPage/AppsPage.tsx`, `src/features/apps/`, API in `backend/.../Features/Apps/`):

- The same paged 3 × 3 grid as YouTube, newest first. A tile shows the app's first image (whatever comes before it), its title and the start of its description. Clicking it opens a popup with every image and video in a sideways slider (swipe, arrows, dots or the arrow keys; moving on pauses a video; a YouTube video gets YouTube's privacy-enhanced player on its own slide and a thumbnail elsewhere, so moving on stops it too). The tile uses the first image, or else a YouTube video's thumbnail and the full description, which may hold `[text](url)` links.
- **The admin** gets an **Add an app** tile first (the first page then holds 8 apps, so it stays 3 × 3), and an **Edit** button in each popup that turns it into the form used for adding: title, description, and the images and videos, which can be uploaded several at once, added from a link (a YouTube video such as a trailer, or an image or video file elsewhere), dragged to reorder and removed. Dragging uses pointer events (`components/useDragSort.ts`): a mouse drags a whole tile, a finger its handle (so the popup still scrolls), and the handle also takes the arrow keys. Closing with unsaved changes asks first. **Delete app** asks too.
- **Categories** (e.g. Mobile app, Website, Video game, the three it starts with) are the admin's own list, edited with **Categories** above the grid (the tab bar names the page, so What's new?, Apps and YouTube have no title of their own): rename, reorder, add, remove (which takes it off every app). An app can have several; they show as labels under its title, on the tile and in the popup, in the list's order.
- **Runs on:** platforms (iOS, Android, … with one click, or typed in), shown in the popup only.
- **Where to get it:** links shown in the popup as **Check it on {name}** buttons, e.g. App Store, Google Play, Steam (suggested while typing; anything else works).
- `GET /api/apps` (public), `POST /api/apps`, `PUT /api/apps/{id}`, `DELETE /api/apps/{id}` (admin), stored in the `apps` table (media, category ids, platforms and links as `jsonb`). `GET /api/apps/categories` (public) and `PUT /api/apps/categories` (admin, the whole ordered list) use `app_categories`. `POST /api/files/app-media` takes one file: images (JPEG, PNG, WebP, GIF up to 15 MB) become a WebP of at most 1920 px without metadata; videos (MP4, MOV, WebM up to 200 MB, recognised by their first bytes) are kept as they are. Files are served with range requests, so videos can start before they're fully downloaded (Safari needs this).
- Saving About Me or an app deletes uploads that **nothing** uses any more, once a day old (`FileCleanup.cs`).
- Videos live in the database like every other upload and are read whole for each request. That's fine for a few short clips; for many or long videos, move `IFileStorage` to object storage (R2, S3) or link YouTube videos instead.

**YouTube** (`src/pages/YouTubePage/YouTubePage.tsx`, API in `backend/.../Features/YouTube/`): the channel's public videos, newest first, in a 3 × 3 grid (2 columns on tablets, 1 on phones). Each card shows the thumbnail, title, date and the start of the description (cut after three lines), and opens the video on YouTube in a new tab. More than 9 videos get Previous / Next, with the page in the URL (`?page=2`).

- `GET /api/youtube/videos?page=1&pageSize=9` (public) reads the uploads with the YouTube Data API v3. It needs `YouTube:Channel` (`@handle` or `UC…` id) and `YouTube:ApiKey`; until both are set it answers 503 and the page says the videos can't be loaded.
- The list is cached in memory for an hour (`RefreshingCache<T>`, a small reusable cache: one fetch at a time, keeps the last list if YouTube fails and retries after 5 minutes). Each refresh costs about 2 units of the free 10,000 a day.
- **Reusable for Apps:** `src/components/PagedGrid/PagedGrid.tsx` (takes the RTK Query hook for a page, e.g. `useListAppsQuery`, and its texts as one `PagedGridTexts` object from the page's view model; shows loading / empty / error and the pagination, and renders its children after the grid, e.g. the app popup) and `src/components/MediaCard.tsx` (image, title, meta line, clamped description; the whole card is a link). `Pagination.tsx` and `usePageParam.ts` are shared with the contact inbox.

Unknown URLs redirect to `/`.

**The tab bar** (`layout/TabNav/TabNav.tsx`): when the window is too narrow for every tab (phones, small windows), a ‹ / › arrow shows
at the end that has more, over a fade, and scrolls the bar most of its width. The arrows are for pointers and fingers; keyboards
reach every tab with Tab. One highlight glides to the tab that's picked. Pressing the current tab and dragging moves it
across; letting go snaps it to the nearest tab, which opens (a tap stays a tap: dragging starts after 5 px, and the click that ends a
drag is swallowed). On phones the bar still scrolls sideways when dragged anywhere else.

**Contact** (`src/pages/ContactPage/ContactPage.tsx`, `src/features/contact/`):

- **Visitors** (`<SignedOut>`) get a form: name (max 100), email, and a message of **100 to 1000 characters**, counted after trimming. Errors appear after the first submit and then update as you type. The rules are in `contactRules.ts`, mirroring the API's `ContactRules.cs`. The API has the final say, and its field errors are shown on the matching fields.
- **The admin** (`<SignedIn>`) gets the inbox: a table of name and date received, 10 per page (the page is in the URL, `?page=2`). Unread messages are bold, with a blue dot. Clicking a row opens a popup with every field and a **Copy** button for each, and marks the message as read.
- Each detail has a copy-to-clipboard icon button (`src/components/CopyButton/CopyButton.tsx`); the icons are in `src/components/icons/icons.tsx`.
- **Deleting:** each row has a trash button, and the popup a **Delete** button (`DELETE /api/contact/messages/{id}`, admin only). Both ask first.
- The popup is `src/components/Modal/Modal.tsx`: it keeps focus inside (Tab wraps), closes with Escape, the × button or a click on the backdrop, and returns focus to the row's button. Keys and clicks inside a dialog stay inside it, so a dialog opened from another (or from a table row) behaves: Escape closes only the top one.
- **Confirming:** `src/components/DeleteButton/DeleteButton.tsx` is the one delete button for the whole site: it opens `ConfirmDialog` ("Delete …?" with Cancel focused) and only then runs `onDelete`. If that is async, the popup waits and says so when it fails. About Me uses it with `action="Remove"` for every remove button, explaining that nothing is lost until the section is saved.

**About Me** (`src/pages/AboutPage/AboutPage.tsx`, `src/features/about/`, API in `backend/.../Features/About/`):

- The page is **one JSON document** (`AboutContent`), stored in the `about_page` table (`jsonb`, one row). It's always read and saved whole, so changing its shape means changing `AboutContent.cs` and the matching types in `api.ts`, with no new migration. Until the first save, `GET` returns `AboutDefaults` (placeholders).
- **Sections:**
  - **Photo and links:** an uploaded photo (or a placeholder icon) on top, then citizenship and residence labels (`statuses`: text and a flag each, e.g. 🇬🇧 "UK Settled Status"; the editor guesses the flag from the words; with none, only the admin sees a hint where they go), then the generated résumé (download button, see [Résumé generator](#résumé-generator)) and GitHub, LeetCode (when a username is set under Problem solving), LinkedIn and Instagram in their brand colours. An empty link is hidden.
  - **Where I've been:** a dotted world map with a pin per city. Each city is marked *worked*, *studied* and/or *visited*, each with an optional note. A pin with several marks is split into equal slices, one colour each. Hovering, focusing or tapping a pin shows its notes. Zoom with the buttons, a pinch, or Ctrl/⌘ + scroll; drag to move.
  - **Problem solving:** LeetCode stats (solved problems, split into Easy, Medium and Hard, out of all on LeetCode) for the username the admin sets (pasting the profile link works too), and the NeetCode lists completed (Blind 75, NeetCode 150, NeetCode 250), switched on and off like licences and shown as labels. NeetCode has no public API, so those are ticked by hand.
  - **Skills:** a timeline. In the editor each skill is folded to a row (name, experience, move and remove buttons) until clicked open; a skill with an error opens by itself. Each skill has periods, each used for *work*, *academic* and/or *personal* (several split the bar into bands). The years of experience are worked out from the periods, counting overlaps once. A skill without periods is listed without a bar. **Sort by experience** orders them by total time (applies on Save, like the sort below).
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

- `POST /api/files/photo` and `POST /api/files/paper` (admin, multipart field `file`) return `{ url, fileName }`. The editor puts the URL in the page; it's used once the section is saved.
- Photos (JPEG, PNG, WebP or GIF, up to 15 MB) are turned upright, scaled to fit 800×800 and stored as WebP **without metadata**, so a phone photo's GPS position never reaches the site. Papers (up to 200 MB) must be PDFs and keep their file name.
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

## Buy me a coffee (donations)

The header's amber **Buy me a coffee** button links to the page in `Support:Url` (Settings tab), hidden while it's empty. The site
uses **[Buy Me a Coffee](https://buymeacoffee.com/claomike)** (it keeps 5% of each coffee, plus the payment processor's fee).

**Coffee alerts** come from its webhook (`Features/Support/SupportEndpoints.cs`): in the Buy Me a Coffee dashboard add a webhook to
`https://<your-domain>/api/support/buymeacoffee`, and paste its secret into Settings. Each request must be signed (HMAC-SHA256 of the
body with the secret, in hex, in `X-Signature-Sha256`, or `X-Bmc-Signature` as older webhooks did). Payments are stored once (unique on
their id, or a hash of the body) and alert the phone.

Buy Me a Coffee doesn't document its webhook's JSON well, so the API reads the common field names (`supporter_name`, `amount`,
`currency`, `support_note`, `supporter_email`, under `data` or `response`) and keeps the whole body in `donations.payload`. **To do:**
after the first real (or "Send test") webhook, check that payload and tighten the parsing. Locally, the webhook can't be reached from
Buy Me a Coffee: it needs the site to be online.

## Email updates

Visitors click **Get updates**, give an email address, and confirm it from an email (double opt-in). From then on they get an
email for every new app and YouTube video, with a one-click unsubscribe link (and the `List-Unsubscribe` headers Gmail and Yahoo
require of bulk senders).

- **Subscribing** (`Features/Updates/UpdatesEndpoints.cs`): addresses are stored lower case, with a random 256-bit token used in
  the confirm and unsubscribe links. The confirmation email isn't sent to the same address more than once per 10 minutes, and each
  IP gets 5 tries per 10 minutes (`Updates:SubscribeLimitPer10Minutes`). The popup says whether a confirmation was sent, one is
  already on its way, or the address is already subscribed (this tells anyone whether an address is subscribed: a choice made
  for clarity). Unsubscribing deletes the row. When the email can't be sent, the visitor hears it didn't work and the admin's
  phone gets the email service's reason.
- **The links** open pages on the site (`/updates/confirm`, `/updates/unsubscribe`, in `pages/UpdatesPages/UpdatesPages.tsx`) that call the
  API, rather than API URLs, so mail scanners that open every link don't confirm anyone.
- **A new app asks first:** adding an app records it as `pending` and sends a phone alert with **Send email** and **Ignore** buttons
  (`AnnouncementDecisions.cs`). The buttons post to the API with a one-time token in the link, since the phone isn't signed in (so
  they only work once the site is online; locally, decide in the Community tab, which has the same two buttons).
- **New videos don't ask:** one published after announcing started is approved by itself.
- **Sending** (`UpdatesAnnouncer.cs`, run every 10 minutes by `UpdatesWorker`, and at once after an approval): emails what's approved,
  reading the app as it is then (edits since are included; a deleted one is skipped). Each item is marked sent *before* the emails go
  out: a crash halfway means some miss it, never that anyone gets it twice. At most 3 items per run; 600 ms between emails.
- **Email service** (`Email.cs`): [Resend](https://resend.com) (free for 3,000 emails a month), while an API key is set (Settings, or
  `Email:ResendApiKey`); otherwise emails are written to the API's log, confirm links included. A sending-only key is enough.
- **Setting up Resend:** add and verify your domain in Resend (its DNS records for SPF/DKIM), then set the **Sender** in Settings (e.g.
  `jechel.dev <updates@jechel.dev>`) and press **Send me a test email**. Until then the sender is `jechel.dev <onboarding@resend.dev>`,
  which Resend only delivers to the Resend account's own address: enough to try subscribing yourself, not for visitors.
- **Privacy:** the terms should say what's stored (the address and when it was confirmed) and that unsubscribing deletes it.

## Résumé generator

Signed in, About Me starts with a **Résumé generator** panel (`features/resume/ResumePanel/ResumePanel.tsx`), which visitors never see. The
résumé is the only one the site offers: there's no upload any more.

- **The header** (headline, email, **phone**) is edited with **Photo and links**, in a "For the résumé (only you see these)" group,
  and shown to the admin under the links. It's saved on its own (`PUT /api/resume/contact`), never in the About Me JSON.
- **The panel** chooses the **sections** (ticked by default: citizenship, links, experience, skills, education, qualifications,
  papers, hackathons, languages; not ticked: problem solving, licences, places) and the **skills** (all until unticked; stored as
  the ones left out, so new skills are in). Sections print in a fixed order recruiters expect.
- The name, contact line and links are on the **first page only**; there are no page numbers. Links show as words: the site's
  name, **GitHub**, **LinkedIn**. Skills are a plain list, without years.
- **Generate résumés** makes two A4 PDFs from the page as it is now (`Features/Resume/ResumeDocument.cs`, with
  [QuestPDF](https://www.questpdf.com), free under its Community licence for individuals and companies under $1M revenue):
  - **public**, without the phone number: stored, and served to everyone at `/api/resume`. The page's **Download résumé** button
    is pointed at it (`/api/resume?v=<time>`, so browsers fetch the new one), replacing an uploaded PDF if there was one.
  - **private**, with the phone number: stored, and only served to the admin (`/api/resume/private`, `no-store`).
  Then **Download private copy** and **Download public copy** in the panel.
- The phone number lives in its own table (`resume`), never in the About Me JSON, so it can't leak through `/api/about`. Tests check
  it's in the private PDF's text and not in the public one's.
- `[text](url)` links on the page become real links in the PDF.

## Phone alerts

The API pushes a notification to the admin's phone for a **new message**, a **coffee**, a **new subscriber**, a **new app** (with
**Send email** / **Ignore** buttons), each **update email sent**, and **crashes**: errors visitors' browsers hit (from the Engagement
recorder) and exceptions the API didn't catch (`CrashAlertHandler`, which still answers with a 500 problem). Crashes are throttled:
the same error once an hour, and at most 10 error alerts an hour in all. Tapping an alert opens the matching page on the site.

They're sent with **[ntfy](https://ntfy.sh)** (free, open source, iOS and Android apps), queued and sent in the background
(`PhoneAlerts`, `AlertWorker`, `NtfySender`), so a slow or broken ntfy never slows a request down. Until a topic is set, alerts only go
to the log. Setting it up (Settings tab, ntfy card):

1. Press **Generate** for a long random topic name, and **Save**. (On the public server anyone who knows a topic can read it.)
2. In the ntfy app tap **+**, type the same topic, keep the server `ntfy.sh`, and **Subscribe**.
3. Press **Send a test alert**.

Optionally reserve the topic with an ntfy account (access token), or use your own server, under "Your own ntfy server".

## Settings (connections)

The admin's **Settings** tab (`pages/SettingsPage/SettingsPage.tsx`, API in `Features/Settings/`) lists every service the site connects to, with
links to their dashboards, the keys, the URLs to paste into them (webhook, OAuth callback), and a test button: Buy Me a Coffee,
Google sign-in, YouTube Data API, Resend, ntfy, and (later) hosting.

- **Storage:** the `site_settings` table, one row per key. Secrets are encrypted with ASP.NET Core Data Protection (the same keys as
  the session cookie; persist them in production, or saved secrets can't be read after a deploy and have to be entered again).
- **Never back to the browser:** a secret is shown as set/not set and its last 4 characters; the box only takes a new one.
- **Applies at once:** a saved value overrides the same key in the configuration (`SettingsStore`, bound into the options with
  `BindWithSettings<T>`; code reads them through `IOptionsMonitor<T>`). **Remove** goes back to the configuration's value.
- **Google sign-in** is shown, not editable: it's read when the API starts, and a wrong secret saved from a page that needs it to
  sign in would lock you out. Change it in user secrets or environment variables.
- Which keys can be set is a fixed list (`SettingsCatalog.cs`); each is checked (links, sender address, topic characters).

## Visitor pages and maintenance

**Settings → Visitor pages** (above the connections) switches each visitor page (What's new, Apps, YouTube, About Me, Contact)
and each feature that needs setting up once live (Book a meeting, Buy me a coffee, Get updates) on or off. **Everything starts
off**, so going live shows nothing half-finished: switch each part on once it's ready. (The E2E tests and the integration tests
start with everything on: `Site:PagesVisibleByDefault`.)

- A page that's off is gone from visitors' tabs, and its link leads to the first page that's on, or **Coming soon** when none is.
  You always see every page; hidden ones have an eye-off mark in the tabs.
- A feature that's off is off for everyone: its button goes, and the API agrees (`/api/meetings/info` and `/api/support` answer
  `""`, subscribing answers 404). The page data APIs stay public: hiding a page is about what's ready, not about secrecy.
- **Under maintenance** (with an optional message) gives visitors the maintenance card in the site's usual frame (the name, the
  theme switch, Vice's scene), without the tabs, the pages, the footer or the header's other buttons; you still see
  everything, with a reminder in the admin bar. Signing in (`/admin`) and the links in emails (`/updates/confirm`,
  `/updates/unsubscribe`) keep working; the screen itself has no admin link.
- **When the API can't be reached** (down, or answering with errors), visitors get the same screen, saying so, and the page asks
  again every 30 seconds and comes back by itself.

**Hosting the frontend on Cloudflare, the API elsewhere:** the SPA is static (Cloudflare Pages), so it stays up while the API is
down, restarting or being deployed, and the maintenance screen is part of it: no second website needed. For planned work on
the frontend itself (or to take everything offline), `frontend/public/maintenance.html` is a standalone page with nothing to
load: point a Cloudflare redirect rule (or a small Worker) at it while the work lasts.

State lives in the `site_state` table (one row) and is read through `SiteEndpoints.LoadAsync` (cached, cleared on save).

## State and caching

### Frontend: Redux (the Model) and MVVM views

- **Redux Toolkit** (`src/store/`). `makeStore()` builds the store in `main.tsx`; use the typed `useAppSelector` / `useAppDispatch`.
  - **Server data: RTK Query** (`store/baseApi.ts`, endpoints per feature in `store/api/*Api.ts` via `injectEndpoints`). Each
    endpoint is a `queryFn` that calls the `api` service (`run(api.apps.list(page, pageSize, signal))`), so requests still go through
    the one axios instance, the preview switch and `ApiError`. Errors are stored as plain `ApiFailure` objects (`{ status, validationErrors }`);
    read any error with `failureOf(error)`. Saves keep views in sync with **tags** (`invalidatesTags`) or by patching the cache
    (`upsertQueryData` / `updateQueryData`, through `whenFulfilled`). Data is shared between views and re-checked when a view comes
    back after 30 s. `toLoadable(result)` turns a hook's result into `loading | error | loaded`; `usePagedQuery` does paged lists.
  - **App state: slices.** `auth` (session), `site` (what visitors see; `fetchSite` / `saveSite`), `terms` (the popup, the accepted
    version), `theme` (the theme on show, the slow-scene notice), `preview` (the admin's preview switch).
  - **Side effects in `store/listeners.ts`** (listener middleware), never in reducers: remembering the theme and `<html data-theme>`,
    the accepted terms, the preview mode; applying the preview to requests and reloading everything when it changes; dropping
    admin-only data on sign-out.
  - Uploads (`api.files.*`) are called from view models directly: their progress isn't the store's to keep.
- **MVVM.** Every view `X.tsx` that has state or logic has a view model, `X.viewModel.ts`, exporting `useXViewModel(props)`; the two
  live in their own folder named after the view (`features/contact/ContactForm/ContactForm.tsx` + `ContactForm.viewModel.ts`).
  Views without a view model stay as plain files (`features/about/list.viewModel.ts` is shared by the list sections, so it stays too).
  The view model holds the state, effects, store access and handlers, and returns what the view shows and the commands it calls;
  the view only renders. **Rule: a `.tsx` file calls no hook except its own `use…ViewModel`.** Views without state or logic
  (`Skeleton`, `MediaCard`, `Pagination`, `TermsDocumentView`, …) need none. Ephemeral UI state (drafts, open popups, drag, hover)
  stays in the view model's own `useState`; anything shared or from the server goes in the store. Pass refs out of a view model
  under a `…Ref` name and destructure them first (`const { dialogRef, ...vm } = useModalViewModel(…)`), or the React Compiler lint
  rule takes every `vm.x` for a ref read.
- **Backend: HybridCache** (`Microsoft.Extensions.Caching.Hybrid`): values are kept in memory, and in **Redis** too when
  `ConnectionStrings:Redis` is set (shared by every API instance, kept across restarts). Keys start with
  `portfolio:{database}:` (`CachePrefix`), so APIs on different databases sharing one Redis (yours and the E2E tests') never
  serve each other's values. Locally it's the
  `redis` service in docker-compose (port 6380, in memory only, 128 MB, least-recently-used out first). Without Redis the API just
  caches in memory. The first value cached this way is `/api/site`; the older in-memory caches (YouTube, LeetCode) can move to it.

## Meetings (Cal.com) and replies

**Visitors** choose between **Send a message** and **Book a meeting** on the Contact page (the second once a Cal.com page is
set in Settings). Booking shows Cal.com's own calendar inline (`features/meetings/CalBooking/CalBooking.tsx`, Cal.com's embed script from
`app.cal.com`), so they see when you're free and pick a slot.

**You decide:** with **Requires confirmation** on the Cal.com event type, a booking is a *request*:
- your phone gets **Meeting request: Grace** with **Accept** / **Decline** buttons (a one-time token in their links)
- the Contact tab has a **Meetings** calendar above the messages: the month with each day's meetings marked (amber waiting,
  green accepted), and the chosen day's meetings, each request with **Accept** / **Decline** and an optional message
- a message from someone who also booked shows that meeting in its popup, with the same buttons

Accepting or declining goes through Cal.com's API (`/v2/bookings/{uid}/confirm` or `/decline`, `cal-api-version: 2026-02-25`),
so Cal.com sends its usual emails and calendar invites; your message, if any, is emailed too (Resend, with your address to reply
to; for a decline it's also Cal.com's reason). Cal.com's webhook (`/api/meetings/cal`) keeps each booking up to date: requested,
created, rescheduled (the old one is marked cancelled), cancelled, rejected.

**Reminders** for accepted meetings go to your phone a day before, 2 hours before, 5 minutes before and when it starts
(`MeetingReminders`, checked every 30 seconds by the site itself; ntfy only keeps scheduled messages for 3 days). If a reminder's
time passed while a later one is due (a meeting accepted an hour before), only the latest goes out. Times in alerts use
`Site:TimeZone` (default Europe/London).

**Replies:** a message's popup has a reply box: the answer is emailed to the sender with their message quoted and your own
address to reply to, and kept with the message. Until a domain is verified in Resend, it only reaches your own address.

**Setting up Cal.com** (Settings → Cal.com has the links and the URL to paste):
1. An event type (e.g. 30 minutes) with your availability, and **Advanced → Requires confirmation** on. Its link goes in Settings.
2. Connect your calendar in Cal.com (Google, Outlook…) so busy times are blocked and accepted meetings land in it.
3. **Settings → Developer → Webhooks:** `https://<your-domain>/api/meetings/cal`, a secret (also in Settings), and the booking
   events: requested, created, rescheduled, cancelled, rejected. Cal.com can't reach `localhost`, so this needs the site online.
4. **Settings → Developer → API keys:** a key, pasted in Settings, so this site can accept and decline for you
   (**Check the API key** tests it).

## Vice on phones and on weak devices

- **Phones** (≤ 640 px): Vice's hide / show button is an icon in the header, left of **Buy me a coffee**. It's pinned over an empty
  slot there (`ContentToggle`'s `anchor`), not inside the header, because the header slides away with the page and the button must
  stay to bring it back. While the page is hidden it waits in the bottom-right corner; when the page comes back it returns to the
  slot once the header has landed. The neon title gets some room from the screen's edge.

**Scrolling:** each page remembers how far down it was (for this tab, `layout/useScrollMemory.ts`): a page you haven't opened
yet starts at the top, and going back to one returns to where you were, retried while its content loads.
- **First visit, no theme chosen yet:** Vice, unless the device can't show it smoothly (`layout/device.ts`): the browser asks to save
  data or is on a slow connection, under 4 GB of memory (Chrome reports it), two cores or fewer, no WebGL 2, or WebGL drawn in
  software (SwiftShader, llvmpipe: no real graphics card). Then the device's own light or dark (`prefers-color-scheme`).
- **Too slow anyway:** the scene counts the frames it manages (it aims for ~30 a second). After a 2-second warm-up, under 20 a second
  over 4 seconds, with the tab visible and focused, it switches to light or dark, remembers that for next visits
  (`theme.slowDevice`), and says so with a **Use Vice anyway** button. Someone who picked Vice themselves is never switched.

## Accessibility

`e2e/a11y.spec.ts` checks every page with [axe](https://github.com/dequelabs/axe-core) against WCAG 2.2 A and AA, in every theme,
plus the popups (Get updates, terms, the welcome), a phone in Vice, and the admin's pages (sign-in faked; About Me with every editor
open, Settings with every card open, the loading and error previews). It runs with the other E2E tests (Chromium, WebKit; Firefox in
CI). YouTube's player is left out: what's inside its frame is YouTube's.

Things it caught, so they stay fixed: white on the bright blue was 3.6:1 (now `--accent-fill`, 5.4:1 and up), the light theme's grey
text was 3.8:1, the pagination over the Vice scene, popup headers counting as extra page banners, a card's link named only by its
title while it held the whole card (now the title is the link, stretched over the card), the title and licence buttons speaking
differently from what they show.

## Loading and error states, and the admin's preview switch

Every view that loads data shows **placeholders shaped like its content** while it waits (no spinners), and a **red box with what
failed and "Try again"** when it can't load. Both are shared: `components/Skeleton.tsx` (`Loading` wraps the shapes in a live
region that says "Loading apps…" and hides the shapes from screen readers; `SkeletonMediaGrid`, `SkeletonTable`, `SkeletonList`,
`SkeletonCard`, `SkeletonText`, `SkeletonChips`, `PageSkeleton`) and `components/ErrorState/ErrorState.tsx`. A new view uses them too.

**Preview switch** (admin bar: Normal / Loading / Error, `features/preview/`): shows the whole site in that state, to check every
view at a glance. It works in the one place every request goes through (`api.ts`'s axios adapter): in **Loading** content requests
(GETs) never answer until the page is left; in **Error** they fail with a 500, through the same path a real failure takes. Sign-in
(`/api/auth/*`) and anything that saves are never touched. Changing it reloads the page's content (and the terms); it's
remembered for the tab (`sessionStorage`) and only applies while signed in. **Development only:** it shows on the dev server
(`npm run dev`, `import.meta.env.DEV`); a production build has no switch and never applies a stored mode (`PREVIEW_AVAILABLE` in
`store/previewSlice.ts`).

## Roadmap: ideas to review

Suggestions from a review of the site for its three audiences (tech employers, recruiters, people
who want to do business), most impact first. Nothing here is decided: review, then pick, reshape
or drop. Suggested first: 1, 2 and 5 (small changes, biggest effect on a first visit).

1. **Say who you are in the first five seconds.** The home page opens on the latest app with no
   statement of who this is or what he does. Add an intro: name, a one-line headline (e.g.
   "Full-stack engineer · .NET, React, Postgres · Manchester"), availability (open to roles /
   freelance), and two buttons: *Download CV* and *Get in touch*.
2. **Reorder About for its readers.** Today: photo → travel map → LeetCode → skills → experience.
   Recruiters look for experience first: summary → work experience (with numbers: "cut API latency
   40%", "shipped to 50k users") → skills → projects → education / qualifications → papers,
   hackathons, languages, licences. Keep the map and LeetCode lower down as personality.
3. **Engineering case studies.** Apps shows games (personality, not the day job). Add 2–3 write-ups:
   the problem, your role, the architecture (diagram), the stack, the hard part, the result. Start
   with **this site**: the WebGL scene built from one image, the 4K upscale and masks, the 66% → 18%
   GPU optimisation, the glass theme system, the test suite. A "How this site works" page.
4. **A "Work with me" page.** What you can be hired for (web apps, APIs, MVPs), how you work,
   typical timelines (optionally "projects from £X"), a booking link for a call, response time.
   Today a would-be client only has the contact form.
5. **Link previews and search.** `index.html` has only a `<title>`. Add a meta description, an Open
   Graph / Twitter image (a crop of the Riviera art), `Person` structured data, and a sitemap, so
   links pasted into Slack and LinkedIn look professional.
6. **Proof from other people.** 2–3 short testimonials (from LinkedIn recommendations), logos of
   companies worked with, GitHub activity / open-source contributions.
7. **Light writing.** A few short technical posts (e.g. how the Vice background was built): shows
   how you think and gives people a reason to come back.

Flags to decide on:

- **Vice as the default for everyone.** It's ~1.5 MB and runs on the GPU continuously. Consider
  falling back to dark on low-powered devices or when the browser asks to save data.

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
| `Site:PublicUrl`              | The site's address, for links in emails, alerts and the résumé (default `http://localhost:5173`) |
| `Support:Url`                 | The **Buy me a coffee** page, e.g. `https://buymeacoffee.com/claomike`. Empty hides the button |
| `Support:BuyMeACoffeeWebhookSecret` | Buy Me a Coffee's webhook secret. The webhook answers 503 until it's set |
| `Email:ResendApiKey`          | Resend API key (secret). Empty: emails are written to the log |
| `Email:From`                  | The sender, on a domain verified in Resend (default `jechel.dev <onboarding@resend.dev>`, which only reaches the Resend account's own address) |
| `Updates:SubscribeLimitPer10Minutes` | Subscribe attempts per IP per 10 minutes (default 5) |
| `Alerts:NtfyTopic`            | The ntfy topic phone alerts go to (secret). Empty: alerts are written to the log |
| `Alerts:NtfyToken` / `Alerts:NtfyServer` | Optional ntfy access token, and server (default `https://ntfy.sh`) |
| `Cal:Link`                    | The Cal.com booking page (`you/30min` or its link). Empty hides **Book a meeting** |
| `Cal:ApiKey`                  | Cal.com API key (secret), to accept and decline from this site |
| `Cal:WebhookSecret`           | The Cal.com webhook's secret. The webhook answers 503 until it's set |
| `Site:TimeZone`               | Your time zone for times in phone alerts (default `Europe/London`) |
| `Site:PagesVisibleByDefault`  | Whether visitor pages and features not yet switched in Settings show (default `false`: everything starts hidden) |
| `ConnectionStrings:Redis`     | Redis for the API's cache, e.g. `localhost:6380,abortConnect=false` (set in appsettings.Development). Empty: memory only |

Every key above from `Support`, `YouTube`, `Email`, `Alerts` and `Cal` can also be set in the **Settings** tab, which overrides these.
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

**Vitest in browser mode**: tests run in a real headless Chromium (Playwright), with the site's own CSS, so what a test sees
(layout, themes, screenshots) is what a visitor sees. Every run measures **coverage of all of `src/`**, tested or not, so
the report shows what isn't covered yet: `coverage/index.html` (and a summary in the terminal).

| Command                | What it runs |
| ---------------------- | ------------ |
| `npm test`             | every test once, with coverage (`coverage/`, written even when a test fails) |
| `npm run test:watch`   | re-runs the tests as files change |
| `npm run test:update`  | rewrites the reference screenshots after an intended visual change (review them before committing) |
| `npm run lint`         | oxlint |
| `npm run typecheck`    | `tsc -b` |
| `npm run build`        | typecheck + Vite build |

- **Where tests live:** next to what they test (`pages/AppsPage/AppsPage.test.tsx`). Shared helpers in `src/test/`:
  `renderView(ui, { path, user, theme })` renders a view the way the site does (store, router, `<main className="page">`,
  a theme, signed in as `ADMIN` or a visitor) and gives `location()` for URL checks; `forever()` keeps a request loading;
  `imagesLoaded()` before a screenshot; `restMouse()` moves the mouse off everything (the mouse stays where the last test
  left it, and a hovered card is drawn raised); `textOf(locator)` for text checks (poll it:
  `expect.poll(() => textOf(x)).toContain(…)`); `a11yViolations()` runs axe (WCAG 2.1 A + AA), expect `[]`.
  Test data in `src/test/fixtures/` (apps with local images, so screenshots never depend on the network).
- **The API is never called:** a test stubs what the view loads, e.g. `vi.spyOn(api.apps, 'list').mockResolvedValue(…)`;
  a never-settling promise shows the loading state, `new ApiError(path, 500)` the error state.
- **Screenshots** (`toMatchScreenshot`): the references are in `__screenshots__/` next to the test, one per browser and OS
  (`…-chromium-darwin.png`), and are committed. Animations and transitions are switched off in tests so they never catch
  one halfway. Vice is shot without its animated Riviera scene (that's the layout's, not the page's). A missing reference
  is written on the first run (that run fails: look at the new image, then run again).

## CI

`.github/workflows/ci.yml` runs on pushes to `develop`/`main` and on every PR:

1. **backend**: restore, build, `dotnet test` (Testcontainers uses the runner's Docker)
2. **frontend**: `npm ci`, lint, build (includes typecheck)

## Conventions

- Git: `develop` is the main branch. Work happens on `feature/*` / `chore/*` branches, merged into `develop`.
- Backend: all routes under `/api`; minimal APIs grouped per feature (`Features/<Feature>/<Feature>Endpoints.cs` with a `Map<Feature>Endpoints` extension). Handlers are public static methods with typed results (`Results<Ok<T>, NotFound>`), so unit tests can call them directly.
- Frontend: all HTTP goes through the `api` object in `src/services/api.ts`, called from RTK Query endpoints (`src/store/api/`); views are MVVM (`X.tsx` + `X.viewModel.ts`, see State and caching); auth-dependent UI uses `useAuth()` (in view models) / `<SignedIn>` / `<SignedOut>` from `src/auth`. Routes are declared in `src/App/App.tsx` (React Router), with one folder per page in `src/pages/` (`X/X.tsx` + `X/X.viewModel.ts`).

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
