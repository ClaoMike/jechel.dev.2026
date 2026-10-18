using System.Security.Cryptography;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Contact;

namespace Portfolio.Api.Features.Updates;

public record SubscribeRequest(string? Email);

public static class SubscribeStatus
{
    /// <summary>A confirmation email is on its way.</summary>
    public const string Sent = "sent";

    /// <summary>Confirmed already: nothing to do.</summary>
    public const string AlreadySubscribed = "alreadySubscribed";

    /// <summary>A confirmation went out less than <see cref="UpdatesEndpoints.ConfirmationCooldown"/> ago: check the inbox.</summary>
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
        // The admin (signed in), or the phone alert's buttons (with the announcement's token).
        updates.MapPost("/announcements/{id:int}/send", (int id, string? token, HttpContext http, PortfolioDbContext db, UpdatesTrigger trigger, CancellationToken ct) =>
            Decide(id, token, AnnouncementStatus.Approved, http, db, trigger, ct)).WithName("SendAnnouncement");
        updates.MapPost("/announcements/{id:int}/ignore", (int id, string? token, HttpContext http, PortfolioDbContext db, UpdatesTrigger trigger, CancellationToken ct) =>
            Decide(id, token, AnnouncementStatus.Ignored, http, db, trigger, ct)).WithName("IgnoreAnnouncement");

        return app;
    }

    /// <summary>
    /// Sends a confirmation email to a new (or not yet confirmed) address, and says what happened:
    /// <see cref="SubscribeStatus.Sent"/>, <see cref="SubscribeStatus.AlreadySubscribed"/>, or
    /// <see cref="SubscribeStatus.Pending"/> (a confirmation went out less than 10 minutes ago).
    /// When the email can't be sent, 503, and the admin's phone is told why (once an hour per reason).
    /// </summary>
    public static async Task<Results<Ok<SubscribeResult>, ValidationProblem, ProblemHttpResult>> Subscribe(
        SubscribeRequest request,
        PortfolioDbContext db,
        IEmailSender emails,
        IOptions<SiteOptions> site,
        IPhoneAlerts alerts,
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
        if (subscriber is { ConfirmedAt: not null }) return TypedResults.Ok(new SubscribeResult(SubscribeStatus.AlreadySubscribed));
        if (subscriber is not null && now - subscriber.ConfirmationSentAt < ConfirmationCooldown) return TypedResults.Ok(new SubscribeResult(SubscribeStatus.Pending));

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
            // The visitor only hears it didn't work; the admin needs the reason (e.g. the sender's domain isn't verified).
            var reason = e is Settings.ServiceException ? e.Message : "The email service couldn't be reached.";
            alerts.SendThrottled($"email:{reason}", new PhoneAlert("Emails aren't going out", $"A visitor couldn't subscribe. {reason}", "/settings", AlertPriority.High, "warning"));
            // Lets them try again at once.
            subscriber.ConfirmationSentAt = default;
            await db.SaveChangesAsync(CancellationToken.None);
            return TypedResults.Problem("The confirmation email couldn't be sent. Please try again later.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        return TypedResults.Ok(new SubscribeResult(SubscribeStatus.Sent));
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
            .OrderByDescending(a => a.CreatedAt)
            .ThenByDescending(a => a.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new AnnouncementDto(a.Id, a.Kind, a.Title, a.Status, a.CreatedAt, a.SentAt, a.RecipientCount))
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(new PagedResponse<AnnouncementDto>(items, page, pageSize, totalCount));
    }

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

    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static async Task<Subscriber?> FindAsync(PortfolioDbContext db, string? token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 100) return null;
        return await db.Subscribers.FirstOrDefaultAsync(s => s.Token == token.Trim(), cancellationToken);
    }
}
