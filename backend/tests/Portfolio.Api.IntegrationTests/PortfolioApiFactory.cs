using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Testcontainers.PostgreSql;

namespace Portfolio.Api.IntegrationTests;

/// <summary>
/// Boots the API against a throwaway PostgreSQL container. Migrations (including seed data)
/// are applied on startup, so tests run against the real schema.
/// </summary>
public class PortfolioApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _db = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Default", _db.GetConnectionString());
        builder.UseSetting("Database:MigrateOnStartup", "true");
    }

    public Task InitializeAsync() => _db.StartAsync();

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
        await _db.DisposeAsync();
    }
}
