# The API's image (docker compose up). Build context: the repository root.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/global.json backend/
COPY backend/src/__NAMESPACE__.Api/__NAMESPACE__.Api.csproj backend/src/__NAMESPACE__.Api/
RUN dotnet restore backend/src/__NAMESPACE__.Api/__NAMESPACE__.Api.csproj
COPY backend/src/__NAMESPACE__.Api/ backend/src/__NAMESPACE__.Api/
RUN dotnet publish backend/src/__NAMESPACE__.Api/__NAMESPACE__.Api.csproj -c Release --no-restore -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
# Npgsql loads Kerberos (GSSAPI) when it connects, and logs an error without it.
RUN apt-get update && apt-get install -y --no-install-recommends libgssapi-krb5-2 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_ENVIRONMENT=Production
USER $APP_UID
ENTRYPOINT ["sh", "-c", "ASPNETCORE_HTTP_PORTS=${PORT:-8080} exec dotnet __NAMESPACE__.Api.dll"]
