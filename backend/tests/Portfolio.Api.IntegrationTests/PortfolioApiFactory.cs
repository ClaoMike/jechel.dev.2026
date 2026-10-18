using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;
using Microsoft.Extensions.Hosting;
using Portfolio.Api.Features.Auth;
using Portfolio.Api.Features.LeetCode;
using Portfolio.Api.Features.Updates;
using Portfolio.Api.Features.YouTube;
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
    public const string KoFiToken = "test-kofi-token";

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
        builder.UseSetting("YouTube:Channel", "@test");
        builder.UseSetting("YouTube:ApiKey", "test-key");
        builder.UseSetting("Support:Url", "https://ko-fi.com/test");
        builder.UseSetting("Support:KoFiVerificationToken", KoFiToken);
        builder.UseSetting("Site:PublicUrl", "https://jechel.test");
        // Every test client comes from the same (unknown) address.
        builder.UseSetting("Updates:SubscribeLimitPer10Minutes", "1000");

        builder.ConfigureTestServices(services =>
        {
            services.AddSingleton<TimeProvider>(Time);
            services.AddSingleton<ILeetCodeClient>(LeetCode);
            services.AddSingleton<IYouTubeClient>(new FakeYouTubeClient());
            services.AddSingleton<IStartupFilter, TestSignInStartupFilter>();
            services.AddSingleton<IEmailSender>(Emails);
            // Announcing runs on a timer; tests that need it call UpdatesAnnouncer themselves.
            var worker = services.Single(s => s.ImplementationType == typeof(UpdatesWorker));
            services.Remove(worker);
        });
    }

    /// <summary>Every email the API sent.</summary>
    public RecordingEmailSender Emails { get; } = new();

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

/// <summary>A channel with 11 videos, v1 the newest.</summary>
public sealed class FakeYouTubeClient : IYouTubeClient
{
    public Task<IReadOnlyList<YouTubeVideo>> FetchVideosAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<YouTubeVideo>>(
            [.. Enumerable.Range(1, 11).Select(n => new YouTubeVideo($"v{n}", $"Video {n}", "About it", $"https://i.ytimg.com/vi/v{n}/hqdefault.jpg", DateTimeOffset.UnixEpoch.AddDays(100 - n)))]);
}

/// <summary>Keeps every email instead of sending it. Thread-safe: tests run in parallel against one API.</summary>
public sealed class RecordingEmailSender : IEmailSender
{
    private readonly System.Collections.Concurrent.ConcurrentQueue<EmailMessage> _sent = new();

    public IReadOnlyList<EmailMessage> To(string address) => [.. _sent.Where(m => m.To == address)];

    public Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        _sent.Enqueue(message);
        return Task.CompletedTask;
    }
}
