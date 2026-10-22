# The API's production image: GitHub Actions builds it (deploy.yml) and pushes it to the GitHub container
# registry, and Sliplane runs it. Build context: the repository root.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/global.json backend/
COPY backend/src/Portfolio.Api/Portfolio.Api.csproj backend/src/Portfolio.Api/
RUN dotnet restore backend/src/Portfolio.Api/Portfolio.Api.csproj
COPY backend/src/Portfolio.Api/ backend/src/Portfolio.Api/
RUN dotnet publish backend/src/Portfolio.Api/Portfolio.Api.csproj -c Release --no-restore -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
# Npgsql loads Kerberos (GSSAPI) when it connects, and logs an error without it.
RUN apt-get update && apt-get install -y --no-install-recommends libgssapi-krb5-2 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app .
# The commit it was built from: /api/health says it (X-App-Version), so a deploy can wait for this build.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
ENV ASPNETCORE_ENVIRONMENT=Production
# The server is small (1 GB, shared with Postgres): one garbage-collected heap, kept tight.
ENV DOTNET_gcServer=0
ENV DOTNET_GCConserveMemory=7
USER $APP_UID
# Sliplane says which port to listen on in PORT.
ENTRYPOINT ["sh", "-c", "ASPNETCORE_HTTP_PORTS=${PORT:-8080} exec dotnet Portfolio.Api.dll"]
