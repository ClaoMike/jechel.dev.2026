# jechel.dev.2026

Personal portfolio website.

| Layer    | Stack                                                  |
| -------- | ------------------------------------------------------ |
| Frontend | React 19 + Vite + TypeScript (`frontend/`)             |
| Backend  | .NET 10 minimal API + EF Core (`backend/`)             |
| Database | PostgreSQL 16 (Docker Compose for local dev)           |

## Prerequisites

- .NET 10 SDK
- Node.js 24+
- Docker (local database + backend integration tests)

## Running locally

```bash
# 1. Database (PostgreSQL on localhost:5433)
docker compose up -d

# 2. API on http://localhost:5105 (applies migrations + seed data on startup)
dotnet run --project backend/src/Portfolio.Api --launch-profile http

# 3. Frontend on http://localhost:5173
cd frontend && npm install && npm run dev
```

## Testing

### Backend (`backend/`)

| Project                          | Type        | Notes                                                      |
| -------------------------------- | ----------- | ---------------------------------------------------------- |
| `Portfolio.Api.UnitTests`        | Unit        | xUnit, EF Core InMemory provider                           |
| `Portfolio.Api.IntegrationTests` | Integration | xUnit + `WebApplicationFactory` + Testcontainers PostgreSQL (needs Docker) |

```bash
cd backend
dotnet test                                            # everything
dotnet test tests/Portfolio.Api.UnitTests              # unit only
dotnet test tests/Portfolio.Api.IntegrationTests       # integration only
```

### Frontend (`frontend/`)

| Command                 | What it runs                                                        |
| ----------------------- | ------------------------------------------------------------------- |
| `npm test`              | Vitest in watch mode (unit + component, React Testing Library, MSW) |
| `npm run test:run`      | Vitest once                                                         |
| `npm run test:coverage` | Vitest with v8 coverage                                             |
| `npm run test:e2e`      | Playwright full-stack E2E (starts API + Vite; needs the DB running) |
| `npm run test:e2e:ui`   | Playwright UI mode                                                  |

First time running E2E: `npx playwright install`.

> Firefox E2E only runs in CI: Playwright's Firefox build doesn't currently launch on macOS 27.

## Database migrations

```bash
dotnet ef migrations add <Name> -p backend/src/Portfolio.Api -o Data/Migrations
```

## CI

`.github/workflows/ci.yml` runs backend tests, frontend lint/build/unit tests, and Playwright E2E against a PostgreSQL service container.
