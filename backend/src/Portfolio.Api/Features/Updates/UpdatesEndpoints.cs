using System.Security.Cryptography;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Contact;

namespace Portfolio.Api.Features.Updates;

public record SubscribeRequest(string? Email);

public record ConfirmedSubscription(string Email);

/// <param name="ConfirmedAt">Null while they haven't clicked the confirmation link.</param>
public record SubscriberDto(int Id, string Email, DateTimeOffset CreatedAt, DateTimeOffset? ConfirmedAt);

public record AnnouncementDto(int Id, string Kind, string Title, DateTimeOffset SentAt, int RecipientCount);

/// <summary>Email updates: visitors subscribe (double opt-in), <see cref="UpdatesAnnouncer"/> emails them what's new.</summary>
public static class UpdatesEndpoints
{
    public const string RateLimitPolicy = "subscribe";

    /// <summary>A confirmation email isn't sent to the same address again sooner than this.</summary>
    public static readonly TimeSpan ConfirmationCooldown = TimeSpan.FromMinutes(10);

    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 50;

    public static IEndpointRouteBuilder MapUpdatesEndpoints(this IEndpointRouteBuilder app)
    {
        var updates = app.MapGroup("/updates");

        // Public. The confirm and unsubscribe links in emails open pages on the site, which call these.
        updates.MapPost("/subscribe", Subscribe).WithName("Subscribe").RequireRateLimiting(RateLimitPolicy);
        updates.MapPost("/confirm", Confirm).WithName("ConfirmSubscription");
        // Also what mail apps' own "Unsubscribe" button posts to (List-Unsubscribe-Post), hence the token in the query.
        updates.MapPost("/unsubscribe", Unsubscribe).WithName("Unsubscribe");

        // Admin only.
        updates.MapGet("/subscribers", ListSubscribers).WithName("ListSubscribers").RequireAuthorization();
        updates.MapDelete("/subscribers/{id:int}", DeleteSubscriber).WithName("DeleteSubscriber").RequireAuthorization();
        updates.MapGet("/announcements", ListAnnouncements).WithName("ListAnnouncements").RequireAuthorization();

        return app;
    }

    /// <summary>
    /// Sends a confirmation email to a new (or not yet confirmed) address. Always 202 for a valid
    /// address, whether it was new, waiting or already subscribed, so nobody can find out who subscribed.
    /// </summary>
    public static async Task<Results<Accepted, ValidationProblem, ProblemHttpResult>> Subscribe(
        SubscribeRequest request,
        PortfolioDbContext db,
        IEmailSender emails,
        IOptions<SiteOptions> site,
        TimeProvider time,
        ILoggerFactory loggers,
        CancellationToken cancellationToken)
    {
        var email = request.Email?.Trim().ToLowerInvariant() ?? "";
        if (email.Length == 0 || email.Length > ContactRules.EmailMaxLength || !ContactRules.IsEmail(email))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["email"] = ["Enter a valid email address."] });
        }

        var now = time.GetUtcNow();
        var subscriber = await db.Subscribers.FirstOrDefaultAsync(s => s.Email == email, cancellationToken);
        if (subscriber is { ConfirmedAt: not null }) return TypedResults.Accepted((string?)null);
        if (subscriber is not null && now - subscriber.ConfirmationSentAt < ConfirmationCooldown) return TypedResults.Accepted((string?)null);

        if (subscriber is null)
        {
            subscriber = new Subscriber { Email = email, Token = NewToken(), CreatedAt = now };
            db.Subscribers.Add(subscriber);
        }
        subscriber.ConfirmationSentAt = now;
        await db.SaveChangesAsync(cancellationToken);

        try
        {
            await emails.SendAsync(UpdateEmails.Confirmation(email, site.Value.UrlFor($"/updates/confirm?token={subscriber.Token}")), cancellationToken);
        }
        catch (Exception e) when (!cancellationToken.IsCancellationRequested)
        {
            loggers.CreateLogger(typeof(UpdatesEndpoints)).LogError(e, "Couldn't send the confirmation email.");
            // Lets them try again at once.
            subscriber.ConfirmationSentAt = default;
            await db.SaveChangesAsync(CancellationToken.None);
            return TypedResults.Problem("The confirmation email couldn't be sent. Please try again later.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        return TypedResults.Accepted((string?)null);
    }

    /// <summary>The link in the confirmation email. Idempotent; 404 for an unknown token (e.g. they unsubscribed since).</summary>
    public static async Task<Results<Ok<ConfirmedSubscription>, NotFound>> Confirm(
        string? token,
        PortfolioDbContext db,
        IPhoneAlerts alerts,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var subscriber = await FindAsync(db, token, cancellationToken);
        if (subscriber is null) return TypedResults.NotFound();

        if (subscriber.ConfirmedAt is null)
        {
            subscriber.ConfirmedAt = time.GetUtcNow();
            await db.SaveChangesAsync(cancellationToken);
            var total = await db.Subscribers.CountAsync(s => s.ConfirmedAt != null, cancellationToken);
            alerts.Send(new PhoneAlert("New subscriber", $"{subscriber.Email} ({total} in all)", "/community", AlertPriority.Low, "bell"));
        }
        return TypedResults.Ok(new ConfirmedSubscription(subscriber.Email));
    }

    /// <summary>Deletes the subscriber. Always 204, also for an unknown token, as mail apps expect.</summary>
    public static async Task<NoContent> Unsubscribe(string? token, PortfolioDbContext db, CancellationToken cancellationToken)
    {
        var subscriber = await FindAsync(db, token, cancellationToken);
        if (subscriber is not null)
        {
            db.Subscribers.Remove(subscriber);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateConcurrencyException)
            {
                // Two clicks (or a mail app and the page) at once: the other one deleted it.
            }
        }
        return TypedResults.NoContent();
    }

    /// <summary>Admin only. Newest first, confirmed or not.</summary>
    public static async Task<Ok<PagedResponse<SubscriberDto>>> ListSubscribers(
        PortfolioDbContext db,
        CancellationToken cancellationToken,
        int page = 1,
        int pageSize = DefaultPageSize)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var totalCount = await db.Subscribers.CountAsync(cancellationToken);
        var items = await db.Subscribers
            .AsNoTracking()
            .OrderByDescending(s => s.CreatedAt)
            .ThenByDescending(s => s.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(s => new SubscriberDto(s.Id, s.Email, s.CreatedAt, s.ConfirmedAt))
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(new PagedResponse<SubscriberDto>(items, page, pageSize, totalCount));
    }

    /// <summary>Admin only.</summary>
    public static async Task<Results<NoContent, NotFound>> DeleteSubscriber(int id, PortfolioDbContext db, CancellationToken cancellationToken)
    {
        var subscriber = await db.Subscribers.FindAsync([id], cancellationToken);
        if (subscriber is null) return TypedResults.NotFound();

        db.Subscribers.Remove(subscriber);
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>Admin only. What was emailed, newest first.</summary>
    public static async Task<Ok<PagedResponse<AnnouncementDto>>> ListAnnouncements(
        PortfolioDbContext db,
        CancellationToken cancellationToken,
        int page = 1,
        int pageSize = DefaultPageSize)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var totalCount = await db.Announcements.CountAsync(cancellationToken);
        var items = await db.Announcements
            .AsNoTracking()
            .OrderByDescending(a => a.SentAt)
            .ThenByDescending(a => a.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new AnnouncementDto(a.Id, a.Kind, a.Title, a.SentAt, a.RecipientCount))
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(new PagedResponse<AnnouncementDto>(items, page, pageSize, totalCount));
    }

    /// <summary>256 random bits, URL-safe.</summary>
    public static string NewToken() => Base64Url(RandomNumberGenerator.GetBytes(32));

    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static async Task<Subscriber?> FindAsync(PortfolioDbContext db, string? token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 100) return null;
        return await db.Subscribers.FirstOrDefaultAsync(s => s.Token == token.Trim(), cancellationToken);
    }
}
