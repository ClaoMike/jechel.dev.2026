using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Features.Auth;
using Portfolio.Api.Features.LeetCode;
using Testcontainers.PostgreSql;

namespace Portfolio.Api.IntegrationTests;

/// <summary>
/// Boots the API against a throwaway PostgreSQL container. Migrations (including seed data)
/// are applied on startup, so tests run against the real schema.
/// Google is configured with dummy credentials (nothing calls Google). To act as a signed-in
/// user, call <see cref="SignInPath"/>: it does what the Google callback does after a
/// successful login (starts the DB session, issues the real auth cookie).
/// </summary>
public class PortfolioApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string AdminEmail = "admin@example.com";
    public const string SignInPath = "/test/sign-in";

    private readonly PostgreSqlContainer _db = new PostgreSqlBuilder("postgres:16-alpine").Build();

    /// <summary>Clock used by the API (sessions and cookies). Advance it to simulate idle time.</summary>
    public FakeTimeProvider Time { get; } = new(DateTimeOffset.UtcNow);

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Default", _db.GetConnectionString());
        builder.UseSetting("Database:MigrateOnStartup", "true");
        builder.UseSetting("Authentication:Google:ClientId", "test-client-id");
        builder.UseSetting("Authentication:Google:ClientSecret", "test-client-secret");
        builder.UseSetting("Auth:AdminEmails:0", AdminEmail);

        builder.ConfigureTestServices(services =>
        {
            services.AddSingleton<TimeProvider>(Time);
            services.AddSingleton<ILeetCodeClient>(LeetCode);
            services.AddSingleton<IStartupFilter, TestSignInStartupFilter>();
        });
    }

    /// <summary>Stands in for leetcode.com, so tests never call it.</summary>
    public FakeLeetCodeClient LeetCode { get; } = new();

    /// <summary>Client that keeps cookies (like a browser) and doesn't follow redirects.</summary>
    public HttpClient CreateBrowserClient() =>
        CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    public Task InitializeAsync() => _db.StartAsync();

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
        await _db.DisposeAsync();
    }

    private sealed class TestSignInStartupFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use(async (context, nextMiddleware) =>
            {
                if (context.Request.Path != SignInPath)
                {
                    await nextMiddleware();
                    return;
                }

                var identity = new ClaimsIdentity(
                    [new Claim(ClaimTypes.Email, context.Request.Query["email"].ToString())],
                    "Google");
                var principal = new ClaimsPrincipal(identity);

                var sessions = context.RequestServices.GetRequiredService<AdminSessionService>();
                await sessions.StartAsync(principal);
                await context.SignInAsync(
                    CookieAuthenticationDefaults.AuthenticationScheme,
                    principal,
                    new AuthenticationProperties { IsPersistent = true });
            });
            next(app);
        };
    }
}

/// <summary>Knows one user, "neetcode" (any case); everyone else doesn't exist.</summary>
public sealed class FakeLeetCodeClient : ILeetCodeClient
{
    public static readonly LeetCodeStats NeetCode = new("NeetCode", new DifficultyCounts(205, 103, 98, 4), new DifficultyCounts(4073, 969, 2124, 980), default);

    public Task<LeetCodeStats?> FetchAsync(string username, CancellationToken cancellationToken) =>
        Task.FromResult(username.Equals("neetcode", StringComparison.OrdinalIgnoreCase) ? NeetCode : null);
}
