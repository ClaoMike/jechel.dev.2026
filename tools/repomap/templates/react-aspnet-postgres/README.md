# __NAME__

A React + TypeScript site (Vite), an ASP.NET Core API and PostgreSQL, all run by Docker.

| | |
| --- | --- |
| Everything in Docker | `docker compose up -d --build`, then http://localhost:__WEB_PORT__ |
| Stop it | `docker compose down` (the database is kept; `down -v` deletes it) |
| Work on the code | `docker compose up -d db`, then `dotnet run` in `backend/src/__NAMESPACE__.Api` (http://localhost:__API_PORT__) and `npm install && npm run dev` in `frontend/` |
| Check the frontend | `npm run lint` (oxlint + Steiger) and `npm run build` in `frontend/` |
| Check the backend | `dotnet test` in `backend/` (the architecture tests included) |

## How the code is organised

**Frontend: [Feature-Sliced Design](https://fsd.how).** `frontend/src` is in layers, each importing only from the ones
below it: `app` (routes, the store, styles) → `pages` → `widgets` → `features` → `entities` → `shared` (the API's base,
strings, helpers). A slice (`pages/home`) is split into segments by purpose (`ui`, `model`, `api`, `lib`, `config`), and
other slices import it only through its `index.ts` (`@/pages/home`). What only one page uses stays in that page.
`npm run lint` checks all of it with [Steiger](https://github.com/feature-sliced/steiger).

**Backend: vertical slices.** Every endpoint is a class of its own in its feature's folder
(`Features/Greetings/GetGreeting.cs`: an `IEndpoint` with `Map` and `Handle`), found by `api.MapEndpoints()`. A feature
also holds its tables (the entity and its EF Core mapping) and what its endpoints share; slices never use each other.
`Common/` is the shared kernel and knows no feature. The unit tests check this (`Architecture/VerticalSliceTests.cs`).

**Database.** EF Core migrations in `backend/src/__NAMESPACE__.Api/Data/Migrations`, applied when the API starts.
After changing the model: `dotnet tool restore`, then `dotnet ef migrations add <Name> --project src/__NAMESPACE__.Api --output-dir Data/Migrations` (in `backend/`).

**The map.** `repomap.config.json` lets repomap (the Board) show both architectures and mark the wires that break them.
