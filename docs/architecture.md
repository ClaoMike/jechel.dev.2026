# Architecture

How the API and the frontend talk: conventions, the API service, state and caching. Part of the [README](../README.md).

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
| PUT    | `/api/about`                | cookie  | Replaces the whole page: **200** with it as stored (trimmed, lists in the order sent), or **400** with field errors keyed by path (`experience[0].title`) |
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
| GET    | `/api/resume?inline=`       | public  | The last generated résumé **without** the email and phone number (PDF), or **404** |
| GET    | `/api/resume/private?inline=` | cookie | The same **with** the phone number |
| GET    | `/api/resume/headline`      | public  | `{ headline }`: shown under the name on About Me (`""` until set); never the phone or email. `no-cache` |
| GET    | `/api/resume/settings`      | cookie  | `{ phone, email, headline, sections, excludedSkills, generatedAt }` |
| PUT    | `/api/resume/contact`       | cookie  | `{ phone, email, headline }` (edited with About Me's profile): **200**, or **400** with field errors |
| PUT    | `/api/resume/choices`       | cookie  | `{ sections, excludedSkills }` without generating: **200**, or **400** |
| POST   | `/api/resume/generate`      | cookie  | `{ sections, excludedSkills }`: saves them, makes both PDFs, and points About Me's résumé link at the public one: **200**, or **400** |
| GET    | `/api/meetings/info`        | cookie  | `{ bookingUrl }`: the Cal.com booking page to send in an answer (**Add booking link**), or `""` |
| POST   | `/api/meetings/cal`         | signature | Cal.com's webhook (HMAC-SHA256 of the body, hex, in `x-cal-signature-256`): keeps bookings up to date, alerts the phone. **401** bad signature, **503** until the secret is set |
| GET    | `/api/meetings?from=&to=`   | cookie  | Meetings overlapping the range (a calendar month), soonest first |
| POST   | `/api/meetings/{id}/accept` | cookie or token | `{ message? }`: confirms a requested meeting with Cal.com and emails the message: **200** `{ status, emailSent }`, **502** when Cal.com refuses |
| POST   | `/api/meetings/{id}/decline` | cookie or token | The same, declining (the message is also Cal.com's reason) |
| POST   | `/api/meetings/{id}/cancel` | cookie  | `{ message? }`: cancels an accepted meeting that hasn't ended with Cal.com (the message is its reason; Cal.com emails them): **200** `{ status }`, **400** when it's over, **502** when Cal.com refuses |
| POST   | `/api/contact/messages/{id}/reply` | cookie | `{ text }`: emails the answer to the sender from the site's address (hello@), in their email's thread, with what they last wrote quoted: **200**, **400**, **503** when it can't be sent |
| POST   | `/api/contact/inbound`      | Resend's signature | Resend's `email.received` webhook: an email to the site's address joins the sender's latest conversation, or starts one: **200**, **400**, **401**, **502** (Resend tries again), **503** until its secret is set |
| GET    | `/api/site`                 | public  | What visitors see: `{ pages, features, maintenance, maintenanceMessage }` (cached: memory, then Redis) |
| PUT    | `/api/site`                 | cookie  | Changes what's given (pages, features, maintenance, its message): **200**, or **400** for unknown ids |
| GET    | `/api/settings`             | cookie  | The connection settings (secrets only as set/not set and their last 4 characters), how Google sign-in is set up, and the site's address |
| PUT    | `/api/settings/{key}`       | cookie  | `{ value }`: saves one (encrypted if secret) and applies it at once; `""` clears it. **400** for a bad value, **404** for an unknown key |
| POST   | `/api/settings/test/{service}` | cookie | `ntfy` (test alert), `email` (test email to you) or `youtube` (lists the videos): **200** `{ ok, message }` |
| POST   | `/api/youtube/refresh` | cookie | Asks YouTube for the videos now and keeps them: **200** `{ count }`, **503** when YouTube isn't set up or can't be reached |

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

- Endpoints are grouped by backend feature (`api.auth`, `api.profile`, ...), one file each:
  `src/services/endpoints/<feature>.ts` holds the group (`<feature>Endpoints`) and its types, mirroring the backend
  records. A new endpoint goes into its feature's file; a new feature gets a new file, added to `api` in `api.ts`.
- `api.ts` puts the groups together and re-exports their types: the rest of the app imports from `services/api`
  only, never from `endpoints/` or `http.ts` (the axios plumbing).
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

## State and caching

### Frontend: Redux and components

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
  - Uploads (`api.files.*`) are called from components directly: their progress isn't the store's to keep.
- **Components.** A component with state or logic keeps it itself: it calls the store's hooks, RTK Query's, `useState`,
  `useEffect` and the rest directly, works out what it shows, and renders it. A component that has a test, styles or parts of
  its own lives in a folder named after it (`features/contact/ContactForm/ContactForm.tsx`). Ephemeral UI state (drafts, open
  popups, drag, hover) stays in the component's own `useState`; anything shared or from the server goes in the store.
  - **Custom hooks** only where they earn it: logic used by more than one component (`usePagedQuery`, `useAuth`, `useTerms`,
    `useMediaQuery`), or a self-contained piece of a component, kept in its file and named for what it does (`useCollapsed` in
    `EditableSection`, `usePagedList` in `CommunityPage`, `useSettledPreview` in `UpdateEmailsEditor`).
  - **Plain functions in `.ts` modules** (no React): rules and formatting that are tested on their own (`licences.ts`,
    `places.ts`, `skills.ts`, `format.ts`). A `.tsx` file exports only components, types and simple constants, so Fast Refresh
    keeps working (oxlint's `only-export-components`); anything else it shares goes in a `.ts` module next to it
    (`components/PagedGrid/slide.ts`).
- **Backend: HybridCache** (`Microsoft.Extensions.Caching.Hybrid`): values are kept in memory, and in **Redis** too when
  `ConnectionStrings:Redis` is set (shared by every API instance, kept across restarts). Keys start with
  `portfolio:{database}:` (`CachePrefix`), so APIs on different databases sharing one Redis (yours and the E2E tests') never
  serve each other's values. Locally it's the
  `redis` service in docker-compose (port 6380, in memory only, 128 MB, least-recently-used out first). Without Redis the API just
  caches in memory. The first value cached this way is `/api/site`; the older in-memory cache (LeetCode) can move to it; YouTube's list has its own store with a database copy.
