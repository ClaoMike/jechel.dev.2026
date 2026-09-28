using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;

namespace Portfolio.Api.IntegrationTests;

/// <summary>
/// Boots the API against a throwaway PostgreSQL container. Migrations (including seed data)
/// are applied on startup, so tests run against the real schema.
/// Google auth is configured with dummy credentials (nothing calls Google), and
/// <see cref="TestAuthHandler"/> lets tests act as a signed-in user.
/// </summary>
public class PortfolioApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string AdminEmail = "admin@example.com";

    private readonly PostgreSqlContainer _db = new PostgreSqlBuilder("postgres:16-alpine").Build();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Default", _db.GetConnectionString());
        builder.UseSetting("Database:MigrateOnStartup", "true");
        builder.UseSetting("Authentication:Google:ClientId", "test-client-id");
        builder.UseSetting("Authentication:Google:ClientSecret", "test-client-secret");
        builder.UseSetting("Auth:AdminEmails:0", AdminEmail);

        builder.ConfigureTestServices(services =>
        {
            services.AddAuthentication()
                .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestAuthHandler.SchemeName, _ => { });
            // Authenticate with the test scheme; challenges still go to the real cookie scheme (401).
            services.PostConfigure<AuthenticationOptions>(options =>
                options.DefaultAuthenticateScheme = TestAuthHandler.SchemeName);
        });
    }

    public Task InitializeAsync() => _db.StartAsync();

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
        await _db.DisposeAsync();
    }
}
