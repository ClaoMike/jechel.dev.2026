using System.Security.Cryptography;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Updates;

public record SubscribeRequest(string? Email);

public static class SubscribeStatus
{
    /// <summary>A confirmation email is on its way.</summary>
    public const string Sent = "sent";

    /// <summary>Confirmed already: nothing to do.</summary>
    public const string AlreadySubscribed = "alreadySubscribed";

    /// <summary>A confirmation went out less than <see cref="UpdatesShared.ConfirmationCooldown"/> ago: check the inbox.</summary>
    public const string Pending = "pending";
}

/// <param name="Status">One of <see cref="SubscribeStatus"/>.</param>
public record SubscribeResult(string Status);

public record ConfirmedSubscription(string Email);

/// <param name="ConfirmedAt">Null while they haven't clicked the confirmation link.</param>
public record SubscriberDto(int Id, string Email, DateTimeOffset CreatedAt, DateTimeOffset? ConfirmedAt);

/// <param name="Status">One of <see cref="AnnouncementStatus"/>.</param>
public record AnnouncementDto(int Id, string Kind, string Title, string Status, DateTimeOffset CreatedAt, DateTimeOffset? SentAt, int RecipientCount);

public record DecisionResult(string Status);

/// <summary>Email updates: visitors subscribe (double opt-in), <see cref="UpdatesAnnouncer"/> emails them what's new.</summary>
public static class UpdatesShared
{
    public const string RateLimitPolicy = "subscribe";

    /// <summary>A confirmation email isn't sent to the same address again sooner than this.</summary>
    public static readonly TimeSpan ConfirmationCooldown = TimeSpan.FromMinutes(10);

    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 50;

    /// <summary>
    /// Sends (<see cref="AnnouncementStatus.Approved"/>) or ignores a pending announcement. Allowed for the
    /// signed-in admin, or with the token from its alert. Deciding again answers with how it was decided.
    /// </summary>
    public static async Task<Results<Ok<DecisionResult>, NotFound, UnauthorizedHttpResult>> Decide(
        int id,
        string? token,
        string decision,
        HttpContext http,
        PortfolioDbContext db,
        UpdatesTrigger trigger,
        CancellationToken cancellationToken)
    {
        var announcement = await db.Announcements.FindAsync([id], cancellationToken);
        if (announcement is null) return TypedResults.NotFound();

        var isAdmin = http.User.Identity?.IsAuthenticated == true;
        if (!isAdmin && !AnnouncementDecisions.TokenMatches(announcement, token)) return TypedResults.Unauthorized();
        if (announcement.Status != AnnouncementStatus.Pending) return TypedResults.Ok(new DecisionResult(announcement.Status));

        announcement.Status = decision;
        announcement.DecisionTokenHash = null;
        await db.SaveChangesAsync(cancellationToken);
        if (decision == AnnouncementStatus.Approved) trigger.Poke();
        return TypedResults.Ok(new DecisionResult(decision));
    }

    /// <summary>256 random bits, URL-safe.</summary>
    public static string NewToken() => Base64Url(RandomNumberGenerator.GetBytes(32));

    internal static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    internal static async Task<Subscriber?> FindAsync(PortfolioDbContext db, string? token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 100) return null;
        return await db.Subscribers.FirstOrDefaultAsync(s => s.Token == token.Trim(), cancellationToken);
    }
}
