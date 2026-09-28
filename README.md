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
│   │   ├── api/                           # typed fetch helpers, one file per backend feature
│   │   ├── auth/                          # AuthProvider + useAuth (current session state)
│   │   ├── pages/                         # one component per route
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
| Run backend tests  | `dotnet test`                                                     |
| Run frontend tests | Starts the DB, then Vitest, then Playwright E2E                    |
| Run all tests      | Backend tests, then frontend tests, in one window                 |

The first click may trigger a macOS prompt to allow Terminal automation; allow it.

## API conventions

- **Every endpoint lives under `/api`** (`app.MapGroup("/api")` in `Program.cs`). Feature endpoint files map *relative* routes onto that group.
- The frontend always calls relative `/api/...` URLs. In dev the Vite proxy forwards them to the API, so browser, cookies and API share one origin (no CORS). Production should do the same: serve the SPA and route `/api` to the API on one domain.
- The Vite proxy sends `X-Forwarded-Host/Proto` (`xfwd: true`) and the API runs `UseForwardedHeaders()`, so URLs the API generates use `localhost:5173`, the origin the browser sees. By default only loopback proxies are trusted; configure `KnownProxies`/`KnownNetworks` when deploying behind a real proxy.

| Method | Route                       | Auth    | Description                                        |
| ------ | --------------------------- | ------- | -------------------------------------------------- |
| GET    | `/api/health`               | public  | `Healthy` when the API can reach the database (used by the launcher and Playwright) |
| GET    | `/api/firstname`            | public  | `{ "firstName": "Claudiu" }` from the database      |
| GET    | `/api/auth/login?returnUrl=`| public  | Browser navigation: redirects to Google sign-in    |
| GET    | `/api/auth/signin-google`   | public  | OAuth callback, handled by ASP.NET Core; don't call directly |
| GET    | `/api/auth/me`              | cookie  | Current user `{ email, name, pictureUrl, sessionExpiresInSeconds }`, or **401** |
| POST   | `/api/auth/logout`          | public  | Clears the cookie; when signed in, also ends the session everywhere |

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
5. The frontend `AuthProvider` calls `/api/auth/me` on load. Signed in, the home page shows "Signed in as ... · Sign out", and `/admin` redirects to `/`.

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

## Configuration

Backend settings live in `backend/src/Portfolio.Api/appsettings*.json` and can be overridden with environment variables (`__` as separator, e.g. `ConnectionStrings__Default`).

| Key                           | Purpose                                                      |
| ----------------------------- | ------------------------------------------------------------ |
| `ConnectionStrings:Default`   | Npgsql connection string                                     |
| `Database:MigrateOnStartup`   | Apply pending EF migrations on startup (`true` in Development) |
| `Authentication:Google:ClientId` / `ClientSecret` | Google OAuth client (secret; user-secrets or env vars). Google sign-in is disabled when empty |
| `Auth:AdminEmails`            | Array of Google emails allowed to sign in                    |
| `Auth:SessionIdleTimeout`     | Admin session idle timeout (default `00:10:00`)              |

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

- **Unit/component tests** live next to the code as `*.test.ts(x)`, run in jsdom, and mock HTTP with MSW. The default handlers in `src/test/server.ts` cover the happy path for an **anonymous** visitor; use `server.use(signedIn())` for a signed-in admin, or `server.use(...)` for other overrides. Unhandled requests fail the test. `renderApp(url)` in `src/test/render.tsx` renders the full app (router + auth) at a URL.
- The real Google round-trip isn't automated. E2E tests cover the `/admin` page and fake a signed-in session with `page.route('**/api/auth/me', ...)`.
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
- Frontend: all HTTP goes through `src/api/client.ts`; one module per backend feature in `src/api/`. Routes are declared in `src/App.tsx` (React Router), with one page component per route in `src/pages/`.

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
