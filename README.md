# jechel.dev.2026

Personal portfolio website of Claudiu Mihai Jechel.

| Layer    | Stack                                                           |
| -------- | --------------------------------------------------------------- |
| Frontend | React 19 + Vite 8 + TypeScript (`frontend/`)                    |
| Backend  | .NET 10 minimal API + EF Core 10 + Npgsql (`backend/`)          |
| Database | PostgreSQL 16 (Docker Compose for local dev)                    |
| Hosting  | Cloudflare Pages (site + `/api` proxy), Sliplane in Germany (API + PostgreSQL + backups) |
| State    | Redux Toolkit + RTK Query; components call hooks directly (see State and caching) |
| Tests    | Backend: xUnit, Testcontainers. Frontend: Vitest in headless Chromium (coverage, screenshots). End to end: Playwright in Chrome, Edge, Firefox and Safari (`e2e/`) |
| CI       | GitHub Actions (`.github/workflows/ci.yml`)                     |

How it all works is in [`docs/`](docs/):

| Document | What's in it |
| -------- | ------------ |
| [Architecture](docs/architecture.md) | API conventions, the frontend's API service and auth state, state and caching |
| [The site](docs/site.md) | The pages and the contact feature, the "j", visitor pages and maintenance, Vice on phones, performance, accessibility, loading and error states |
| [Features](docs/features.md) | Terms, Engagement (analytics), Buy me a coffee, email updates, the résumé generator, conversations, meetings |
| [Admin](docs/admin.md) | Google sign-in, phone alerts, notifications, Settings |
| [Testing and CI](docs/testing.md) | Backend and frontend tests, the helpers, screenshots, what CI runs |
| [Deployment](docs/deployment.md) | Cloudflare Pages and Sliplane, the deploy pipeline, setting them up |

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
│   ├── functions/api/[[path]].ts          # Cloudflare Pages Function: the site's /api proxy to the API on Sliplane (production)
│   ├── src/
│   │   ├── strings.ts                     # every text the site shows or reads out, by component
│   │   ├── services/api.ts                # the single API service: every backend call goes through `api`
│   │   ├── services/endpoints/<feature>.ts # each feature's endpoints and types (put together by api.ts)
│   │   ├── services/http.ts               # the plumbing under them: axios, ApiError, the preview switch
│   │   ├── store/                         # the Model: Redux store, slices, RTK Query endpoints (store/api/)
│   │   ├── auth/                          # useAuth, useSessionKeeper, <SignedIn>/<SignedOut> (state in store/authSlice)
│   │   ├── layout/                        # site frame: greeting, session bar, section tabs
│   │   ├── pages/                         # one folder per route: X/X.tsx (with its test)
│   │   ├── features/<feature>/            # a feature's components and rules (e.g. contact form + inbox)
│   │   └── components/                    # shared UI: Modal, CopyButton, icons
├── e2e/                               # end-to-end tests: the whole site in four browsers (./e2e/run.sh)
├── backend/Dockerfile                    # the API's production image (built by deploy.yml, run on Sliplane)
├── backend/db-backup/                    # the nightly database backup's image (pg_dump to a volume)
├── scripts/dev_launcher.py                # GUI launcher for common dev tasks (macOS)
├── scripts/deploy.sh                      # deploy: pull request develop → main, merged when CI passes
├── scripts/test.sh                        # every test CI runs, locally (CI itself only runs on the way to main)
├── scripts/build_link_preview.mjs         # draws the link preview image (public/og-image.jpg)
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
| Run backend tests  | `backend/test.sh` (all tests, with coverage), then opens the coverage report in the browser |
| Run frontend tests | `npm test` in `frontend` (all tests, with coverage), then opens the coverage report in the browser |
| Run all tests      | Both of the above, one after the other, then both coverage reports |
| Deploy to production | `scripts/deploy.sh`: only enabled on `develop`. See [Deployment](docs/deployment.md#deployment) |

The first click may trigger a macOS prompt to allow Terminal automation; allow it.

## Roadmap

- **Work with me**: built, being tried in the admin's Feature Testing (System → Feature Testing) (see [The site](docs/site.md)). Still to
  decide: where visitors get it (Contact, or a page of its own), then switch it on in Settings → Visitor pages.

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
| `Email:From`                  | The sender, on a domain verified in Resend (default `jechel.dev <onboarding@resend.dev>`, which only reaches the Resend account's own address). Emails to its address land in the Contact inbox |
| `Email:InboundWebhookSecret`  | The signing secret (`whsec_…`) of Resend's `email.received` webhook (secret). Empty: nothing is received, and answers ask for replies to your own address |
| `Updates:SubscribeLimitPer10Minutes` | Subscribe attempts per IP per 10 minutes (default 5) |
| `Alerts:NtfyTopic`            | The ntfy topic phone alerts go to (secret). Empty: alerts are written to the log |
| `Alerts:NtfyToken` / `Alerts:NtfyServer` | Optional ntfy access token, and server (default `https://ntfy.sh`) |
| `Cal:Link`                    | The Cal.com booking page (`you/30min` or its link), sent by **Add booking link**. Empty hides the button |
| `Cal:ApiKey`                  | Cal.com API key (secret), to accept and decline from this site |
| `Cal:WebhookSecret`           | The Cal.com webhook's secret. The webhook answers 503 until it's set |
| `Site:TimeZone`               | Your time zone for times in phone alerts (default `Europe/London`) |
| `Site:PagesVisibleByDefault`  | Whether visitor pages and features not yet switched in Settings show (default `false`: everything starts hidden) |
| `Proxy:Secret`                | The secret the site's `/api` proxy sends (production; see Deployment). Empty: no proxy check |
| `Auth:AdminGoogleIds`         | Optional array: the admin Google accounts' permanent ids ("sub"). When set, an account needs one as well as an allowed email |
| `Auth:SessionMaxLifetime`     | A session's absolute limit, however active (default `12:00:00`) |
| `DataProtection:KeyEncryptionKey` | 32 bytes in base64 (`openssl rand -base64 32`): encrypts the Data Protection keys in the database. Production; losing it signs everyone out and loses the Settings secrets |
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

## Conventions

- Git: work happens on `develop` (or `feature/*` / `chore/*` branches merged into it). `main` is production and only takes pull requests from `develop` that passed CI (see Deployment).
- Backend: all routes under `/api`; minimal APIs grouped per feature (`Features/<Feature>/<Feature>Endpoints.cs` with a `Map<Feature>Endpoints` extension). Handlers are public static methods with typed results (`Results<Ok<T>, NotFound>`), so unit tests can call them directly.
- Frontend: all HTTP goes through the `api` object in `src/services/api.ts`, called from RTK Query endpoints (`src/store/api/`); components hold their own state and call hooks directly (see State and caching); auth-dependent UI uses `useAuth()` / `<SignedIn>` / `<SignedOut>` from `src/auth`. Routes are declared in `src/App/App.tsx` (React Router), with one folder per page in `src/pages/` (`X/X.tsx`).

## Troubleshooting

- **Integration tests fail with a Docker socket error**: start Docker Desktop.
- **`Port 5173 is already in use`**: another Vite instance is running; stop it (the port is strict so E2E and the backend config stay predictable).
- **Frontend shows the error message**: check the API is running on 5105 and the DB container is healthy (`docker compose ps`).
- **`[vite] http proxy error ... ECONNREFUSED`**: the page called `/api` while the API wasn't listening (not started yet, still building, or crashed). Check `curl localhost:5105/api/health`. The launcher's *Start website* waits for the API to avoid this.
- **`/api/auth/login` returns 503**: Google credentials aren't set; see [Setting up Google sign-in](docs/admin.md#setting-up-google-sign-in).
- **Google says `redirect_uri_mismatch`**: the redirect URI registered in Google must exactly match `http://localhost:5173/api/auth/signin-google`. Open the site via 5173, not the API port.
- **Google says access blocked / app not verified**: while the consent screen is in *Testing*, only listed test users can sign in.
- **Redirected to `/admin?error=not_authorized`**: your email isn't in `Auth:AdminEmails` (`dotnet user-secrets list`).
- **Launcher: `No module named '_tkinter'`**: `brew install python-tk@3.14` (match your Python version).
