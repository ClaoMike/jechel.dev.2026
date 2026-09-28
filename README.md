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
│   │   └── test/                          # Vitest setup + MSW mock server
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
| Frontend    | http://localhost:5173      | Vite dev server (`strictPort`, fails if taken)        |
| API         | http://localhost:5105      | `http` launch profile                                |
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
| Start website      | Both of the above in two windows, and opens the site in the browser |
| Run backend tests  | `dotnet test`                                                     |
| Run frontend tests | Starts the DB, then Vitest, then Playwright E2E                    |
| Run all tests      | Backend tests, then frontend tests, in one window                 |

The first click may trigger a macOS prompt to allow Terminal automation; allow it.

## Configuration

Backend settings live in `backend/src/Portfolio.Api/appsettings*.json` and can be overridden with environment variables (`__` as separator, e.g. `ConnectionStrings__Default`).

| Key                           | Purpose                                                      |
| ----------------------------- | ------------------------------------------------------------ |
| `ConnectionStrings:Default`   | Npgsql connection string                                     |
| `Database:MigrateOnStartup`   | Apply pending EF migrations on startup (`true` in Development) |

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
| `Portfolio.Api.IntegrationTests` | Integration | xUnit + `WebApplicationFactory<Program>`; spins up a throwaway `postgres:16-alpine` container via Testcontainers, runs migrations, sends real HTTP requests. **Needs Docker running.** |

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

- **Unit/component tests** live next to the code as `*.test.ts(x)`, run in jsdom, and mock HTTP with MSW. The default handlers in `src/test/server.ts` cover the happy path; override them per test with `server.use(...)`. Unhandled requests fail the test.
- **E2E tests** live in `e2e/`. Playwright starts the real API and the Vite dev server itself (or reuses ones already running locally). The database must be running (`docker compose up -d --wait`). First run: `npx playwright install`.
- Browsers: Chromium and WebKit locally. **Firefox runs only in CI** because Playwright's Firefox build currently fails to launch on macOS 27 ("Could not find profile folder"). Try removing the `process.env.CI` guard in `playwright.config.ts` after a Playwright upgrade.

## CI

`.github/workflows/ci.yml` runs on pushes to `develop`/`main` and on every PR:

1. **backend**: restore, build, `dotnet test` (Testcontainers uses the runner's Docker)
2. **frontend**: `npm ci`, lint, build (includes typecheck), Vitest with coverage
3. **e2e** (after both pass): PostgreSQL service container on 5433 + Playwright on Chromium, WebKit and Firefox. The HTML report is uploaded as an artifact on failure.

## Conventions

- Git: `develop` is the main branch. Work happens on `feature/*` / `chore/*` branches, merged into `develop`.
- Backend: minimal APIs grouped per feature (`Features/<Feature>/<Feature>Endpoints.cs` with a `Map<Feature>Endpoints` extension). Handlers are public static methods with typed results (`Results<Ok<T>, NotFound>`), so unit tests can call them directly.
- Frontend: all HTTP goes through `src/api/client.ts`; one module per backend feature in `src/api/`.

## Troubleshooting

- **Integration tests fail with a Docker socket error**: start Docker Desktop.
- **`Port 5173 is already in use`**: another Vite instance is running; stop it (the port is strict so E2E and the backend config stay predictable).
- **Frontend shows the error message**: check the API is running on 5105 and the DB container is healthy (`docker compose ps`).
- **Launcher: `No module named '_tkinter'`**: `brew install python-tk@3.14` (match your Python version).
