using System.Buffers.Text;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Analytics;

namespace Portfolio.Api.Features.Auth;

public enum SessionStatus
{
    Invalid,
    Valid,
    /// <summary>Valid, and the expiry was pushed forward, so the cookie should be re-issued.</summary>
    Extended,
}

/// <summary>A signed-in device, as the admin's list shows it.</summary>
/// <param name="Device">E.g. "Chrome on macOS".</param>
/// <param name="DeviceType">"desktop", "mobile" or "tablet".</param>
/// <param name="Current">The device asking.</param>
public record AdminSessionInfo(
    Guid Id,
    string Device,
    string DeviceType,
    string? IpAddress,
    string? Country,
    DateTimeOffset CreatedAt,
    DateTimeOffset LastSeenAt,
    DateTimeOffset EndsAt,
    bool Current);

/// <summary>
/// The admin's sessions, one per signed-in device (<see cref="AdminSession"/>). The auth cookie only
/// carries a random token; the database holds its hash, so any session can be ended at once. A session
/// ends after <see cref="AdminOptions.SessionIdleTimeout"/> without activity, and
/// <see cref="AdminOptions.SessionMaxLifetime"/> after signing in whatever happens.
/// </summary>
public class AdminSessionService(PortfolioDbContext db, TimeProvider time, IOptionsMonitor<AdminOptions> options)
{
    public const string TokenClaimType = "session_token";
    public const int UserAgentMaxLength = 512;

    /// <summary>Extend at most once per interval, so not every request writes to the database.</summary>
    public static readonly TimeSpan ExtendInterval = TimeSpan.FromMinutes(1);

    private TimeSpan IdleTimeout => options.CurrentValue.SessionIdleTimeout;

    /// <summary>The session validated or started during this request.</summary>
    public AdminSession? Current { get; private set; }

    /// <summary>When the session validated or started during this request ends unless there's activity.</summary>
    public DateTimeOffset? CurrentExpiresAt => Current?.ExpiresAt;

    /// <summary>
    /// Starts a new session for this device and adds its token to the principal. Other devices stay
    /// signed in. Sessions that have ended are cleared out on the way.
    /// </summary>
    public async Task<AdminSession> StartAsync(ClaimsPrincipal principal, HttpContext http, CancellationToken cancellationToken = default)
    {
        if (principal.Identity is not ClaimsIdentity identity) throw new ArgumentException("The principal has no identity.", nameof(principal));

        var now = time.GetUtcNow();
        db.AdminSessions.RemoveRange(await db.AdminSessions.Where(s => s.ExpiresAt <= now || s.EndsAt <= now).ToListAsync(cancellationToken));

        var token = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));
        var endsAt = now + options.CurrentValue.SessionMaxLifetime;
        var userAgent = http.Request.Headers.UserAgent.ToString();
        var session = new AdminSession
        {
            Id = Guid.NewGuid(),
            TokenHash = Hash(token),
            Email = principal.FindFirstValue(ClaimTypes.Email) ?? "",
            CreatedAt = now,
            LastSeenAt = now,
            ExpiresAt = Min(now + IdleTimeout, endsAt),
            EndsAt = endsAt,
            UserAgent = userAgent.Length <= UserAgentMaxLength ? userAgent : userAgent[..UserAgentMaxLength],
            IpAddress = http.Connection.RemoteIpAddress?.ToString(),
            Country = AnalyticsRules.NormalizeCountry(http.Request.Headers["CF-IPCountry"]),
        };
        db.AdminSessions.Add(session);
        await db.SaveChangesAsync(cancellationToken);

        identity.AddClaim(new Claim(TokenClaimType, token));
        Current = session;
        return session;
    }

    /// <summary>Whether the cookie's session is still on; pushes its expiry forward (at most once a minute, never past its end).</summary>
    public async Task<SessionStatus> ValidateAsync(ClaimsPrincipal principal, CancellationToken cancellationToken = default)
    {
        var token = principal.FindFirstValue(TokenClaimType);
        if (string.IsNullOrEmpty(token)) return SessionStatus.Invalid;

        var hash = Hash(token);
        var session = await db.AdminSessions.FirstOrDefaultAsync(s => s.TokenHash == hash, cancellationToken);
        var now = time.GetUtcNow();
        if (session is null) return SessionStatus.Invalid;
        if (session.ExpiresAt <= now || session.EndsAt <= now ||
            !string.Equals(session.Email, principal.FindFirstValue(ClaimTypes.Email), StringComparison.OrdinalIgnoreCase))
        {
            db.AdminSessions.Remove(session);
            await db.SaveChangesAsync(cancellationToken);
            return SessionStatus.Invalid;
        }

        Current = session;
        var extended = Min(now + IdleTimeout, session.EndsAt);
        if (extended - session.ExpiresAt < ExtendInterval) return SessionStatus.Valid;

        session.ExpiresAt = extended;
        session.LastSeenAt = now;
        await db.SaveChangesAsync(cancellationToken);
        return SessionStatus.Extended;
    }

    /// <summary>Every device still signed in, the most recently active first.</summary>
    public async Task<IReadOnlyList<AdminSessionInfo>> ListAsync(CancellationToken cancellationToken = default)
    {
        var now = time.GetUtcNow();
        var sessions = await db.AdminSessions.AsNoTracking()
            .Where(s => s.ExpiresAt > now && s.EndsAt > now)
            .OrderByDescending(s => s.LastSeenAt)
            .ToListAsync(cancellationToken);
        return [.. sessions.Select(s =>
        {
            var agent = AnalyticsRules.ParseUserAgent(s.UserAgent);
            return new AdminSessionInfo(s.Id, Describe(agent), agent.Device, s.IpAddress, s.Country, s.CreatedAt, s.LastSeenAt, s.EndsAt, s.Id == Current?.Id);
        })];
    }

    /// <summary>"Chrome on macOS", or "A browser" when it can't be told.</summary>
    public static string Describe(AnalyticsRules.UserAgentInfo agent) =>
        (agent.Browser, agent.OperatingSystem) switch
        {
            ("Other", "Other") => "A browser",
            ("Other", var os) => $"A browser on {os}",
            (var browser, "Other") => browser,
            var (browser, os) => $"{browser} on {os}",
        };

    /// <summary>Signs out this request's device.</summary>
    public Task EndCurrentAsync(CancellationToken cancellationToken = default) =>
        Current is { } session ? EndAsync(session.Id, cancellationToken) : Task.CompletedTask;

    /// <summary>Signs out one device. False when there's no such session.</summary>
    public async Task<bool> EndAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var session = await db.AdminSessions.FindAsync([id], cancellationToken);
        if (Current?.Id == id) Current = null;
        if (session is null) return false;
        db.AdminSessions.Remove(session);
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    /// <summary>Ends the session a cookie carries, if it's still there.</summary>
    public async Task EndAsync(ClaimsPrincipal principal, CancellationToken cancellationToken = default)
    {
        var token = principal.FindFirstValue(TokenClaimType);
        if (string.IsNullOrEmpty(token)) return;
        var hash = Hash(token);
        var session = await db.AdminSessions.FirstOrDefaultAsync(s => s.TokenHash == hash, cancellationToken);
        if (session is null) return;
        db.AdminSessions.Remove(session);
        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Signs out every device but this one. Returns how many.</summary>
    public async Task<int> EndOthersAsync(CancellationToken cancellationToken = default)
    {
        var current = Current?.Id;
        var others = await db.AdminSessions.Where(s => s.Id != current).ToListAsync(cancellationToken);
        db.AdminSessions.RemoveRange(others);
        await db.SaveChangesAsync(cancellationToken);
        return others.Count;
    }

    public static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static DateTimeOffset Min(DateTimeOffset a, DateTimeOffset b) => a < b ? a : b;
}
