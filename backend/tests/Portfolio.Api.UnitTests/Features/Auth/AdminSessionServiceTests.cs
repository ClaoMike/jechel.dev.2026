using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Auth;

namespace Portfolio.Api.UnitTests.Features.Auth;

public class AdminSessionServiceTests
{
    private static readonly TimeSpan IdleTimeout = TimeSpan.FromMinutes(10);

    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 1, 1, 12, 0, 0, TimeSpan.Zero));
    private readonly PortfolioDbContext _db;
    private readonly AdminSessionService _sessions;

    public AdminSessionServiceTests()
    {
        _db = new PortfolioDbContext(new DbContextOptionsBuilder<PortfolioDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        _db.Profiles.Add(new Data.Profile { Id = 1, FirstName = "Claudiu" });
        _db.SaveChanges();

        _sessions = CreateService();
    }

    // A fresh service per "request", like the scoped registration in the app.
    private AdminSessionService CreateService() => new(
        _db,
        _time,
        Mock.Monitor(new AdminOptions { SessionIdleTimeout = IdleTimeout }));

    private static ClaimsPrincipal NewPrincipal() =>
        new(new ClaimsIdentity([new Claim(ClaimTypes.Email, "admin@example.com")], "Test"));

    private async Task<ClaimsPrincipal> SignInAsync()
    {
        var principal = NewPrincipal();
        Assert.True(await CreateService().StartAsync(principal));
        return principal;
    }

    [Fact]
    public async Task Start_stores_only_the_token_hash_and_the_expiry()
    {
        var principal = await SignInAsync();

        var token = principal.FindFirstValue(AdminSessionService.TokenClaimType);
        var profile = await _db.Profiles.SingleAsync();
        Assert.False(string.IsNullOrEmpty(token));
        Assert.Equal(AdminSessionService.Hash(token!), profile.SessionTokenHash);
        Assert.NotEqual(token, profile.SessionTokenHash);
        Assert.Equal(_time.GetUtcNow() + IdleTimeout, profile.SessionExpiresAt);
    }

    [Fact]
    public async Task Start_fails_without_a_profile()
    {
        _db.Profiles.RemoveRange(_db.Profiles);
        await _db.SaveChangesAsync();

        Assert.False(await _sessions.StartAsync(NewPrincipal()));
    }

    [Fact]
    public async Task Validate_accepts_the_current_session()
    {
        var principal = await SignInAsync();

        Assert.Equal(SessionStatus.Valid, await CreateService().ValidateAsync(principal));
    }

    [Fact]
    public async Task Validate_rejects_a_missing_or_wrong_token()
    {
        await SignInAsync();
        var forged = NewPrincipal();
        ((ClaimsIdentity)forged.Identity!).AddClaim(new Claim(AdminSessionService.TokenClaimType, "forged"));

        Assert.Equal(SessionStatus.Invalid, await CreateService().ValidateAsync(NewPrincipal()));
        Assert.Equal(SessionStatus.Invalid, await CreateService().ValidateAsync(forged));
    }

    [Fact]
    public async Task Session_expires_after_the_idle_timeout()
    {
        var principal = await SignInAsync();

        _time.Advance(IdleTimeout);

        Assert.Equal(SessionStatus.Invalid, await CreateService().ValidateAsync(principal));
    }

    [Fact]
    public async Task Activity_extends_the_session_at_most_once_per_interval()
    {
        var principal = await SignInAsync();

        _time.Advance(TimeSpan.FromSeconds(30));
        Assert.Equal(SessionStatus.Valid, await CreateService().ValidateAsync(principal));

        _time.Advance(TimeSpan.FromMinutes(6));
        Assert.Equal(SessionStatus.Extended, await CreateService().ValidateAsync(principal));
        Assert.Equal(_time.GetUtcNow() + IdleTimeout, (await _db.Profiles.SingleAsync()).SessionExpiresAt);

        // 9 minutes after the last activity: still signed in, 16.5 minutes after signing in.
        _time.Advance(TimeSpan.FromMinutes(9));
        Assert.Equal(SessionStatus.Extended, await CreateService().ValidateAsync(principal));
    }

    [Fact]
    public async Task Signing_in_again_ends_the_previous_session()
    {
        var first = await SignInAsync();
        var second = await SignInAsync();

        Assert.Equal(SessionStatus.Invalid, await CreateService().ValidateAsync(first));
        Assert.Equal(SessionStatus.Valid, await CreateService().ValidateAsync(second));
    }

    [Fact]
    public async Task End_clears_the_session()
    {
        var principal = await SignInAsync();

        await CreateService().EndAsync();

        var profile = await _db.Profiles.SingleAsync();
        Assert.Null(profile.SessionTokenHash);
        Assert.Null(profile.SessionExpiresAt);
        Assert.Equal(SessionStatus.Invalid, await CreateService().ValidateAsync(principal));
    }
}

internal static class Mock
{
    public static IOptionsMonitor<T> Monitor<T>(T value) => new StaticOptionsMonitor<T>(value);

    private sealed class StaticOptionsMonitor<T>(T value) : IOptionsMonitor<T>
    {
        public T CurrentValue => value;
        public T Get(string? name) => value;
        public IDisposable? OnChange(Action<T, string?> listener) => null;
    }
}
