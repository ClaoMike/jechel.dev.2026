# The API's production image (Railway builds it; see railway.json). Build context: the repository root.
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
# Railway says which port to listen on in PORT.
ENV ASPNETCORE_ENVIRONMENT=Production
USER $APP_UID
ENTRYPOINT ["sh", "-c", "ASPNETCORE_HTTP_PORTS=${PORT:-8080} exec dotnet Portfolio.Api.dll"]
