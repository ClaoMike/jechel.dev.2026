using System.Buffers.Text;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Auth;

public enum SessionStatus
{
    Invalid,
    Valid,
    /// <summary>Valid, and the expiry was pushed forward, so the cookie should be re-issued.</summary>
    Extended,
}

/// <summary>
/// Server-side admin session stored on the profile row. The auth cookie only carries a random
/// token; the database holds its hash and the expiry, so sessions can be revoked everywhere.
/// </summary>
public class AdminSessionService(PortfolioDbContext db, TimeProvider time, IOptionsMonitor<AdminOptions> options)
{
    public const string TokenClaimType = "session_token";

    /// <summary>Extend at most once per interval, so not every request writes to the database.</summary>
    public static readonly TimeSpan ExtendInterval = TimeSpan.FromMinutes(1);

    private TimeSpan IdleTimeout => options.CurrentValue.SessionIdleTimeout;

    /// <summary>Expiry of the session validated or started during this request.</summary>
    public DateTimeOffset? CurrentExpiresAt { get; private set; }

    /// <summary>
    /// Starts a new session (replacing any existing one) and adds its token to the principal.
    /// Returns false if there is no profile to attach the session to.
    /// </summary>
    public async Task<bool> StartAsync(ClaimsPrincipal principal, CancellationToken cancellationToken = default)
    {
        var profile = await GetProfileAsync(cancellationToken);
        if (profile is null || principal.Identity is not ClaimsIdentity identity)
        {
            return false;
        }

        var token = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));
        profile.SessionTokenHash = Hash(token);
        profile.SessionExpiresAt = time.GetUtcNow() + IdleTimeout;
        await db.SaveChangesAsync(cancellationToken);

        identity.AddClaim(new Claim(TokenClaimType, token));
        CurrentExpiresAt = profile.SessionExpiresAt;
        return true;
    }

    public async Task<SessionStatus> ValidateAsync(ClaimsPrincipal principal, CancellationToken cancellationToken = default)
    {
        var token = principal.FindFirstValue(TokenClaimType);
        if (string.IsNullOrEmpty(token))
        {
            return SessionStatus.Invalid;
        }

        var profile = await GetProfileAsync(cancellationToken);
        var now = time.GetUtcNow();
        if (profile?.SessionTokenHash is null ||
            profile.SessionExpiresAt is not { } expiresAt ||
            expiresAt <= now ||
            !CryptographicOperations.FixedTimeEquals(
                Encoding.ASCII.GetBytes(profile.SessionTokenHash),
                Encoding.ASCII.GetBytes(Hash(token))))
        {
            return SessionStatus.Invalid;
        }

        var status = SessionStatus.Valid;
        if (expiresAt - now <= IdleTimeout - ExtendInterval)
        {
            profile.SessionExpiresAt = now + IdleTimeout;
            await db.SaveChangesAsync(cancellationToken);
            status = SessionStatus.Extended;
        }

        CurrentExpiresAt = profile.SessionExpiresAt;
        return status;
    }

    /// <summary>Ends the session everywhere.</summary>
    public async Task EndAsync(CancellationToken cancellationToken = default)
    {
        var profile = await GetProfileAsync(cancellationToken);
        if (profile is null)
        {
            return;
        }

        profile.SessionTokenHash = null;
        profile.SessionExpiresAt = null;
        await db.SaveChangesAsync(cancellationToken);
        CurrentExpiresAt = null;
    }

    public static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private Task<Data.Profile?> GetProfileAsync(CancellationToken cancellationToken) =>
        db.Profiles.OrderBy(p => p.Id).FirstOrDefaultAsync(cancellationToken);
}
