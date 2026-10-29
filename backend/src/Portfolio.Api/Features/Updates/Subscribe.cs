using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Contact;
using static Portfolio.Api.Features.Updates.UpdatesShared;

namespace Portfolio.Api.Features.Updates;

/// <summary>
/// Sends a confirmation email to a new (or not yet confirmed) address, and says what happened:
/// <see cref="SubscribeStatus.Sent"/>, <see cref="SubscribeStatus.AlreadySubscribed"/>, or
/// <see cref="SubscribeStatus.Pending"/> (a confirmation went out less than 10 minutes ago).
/// When the email can't be sent, 503, and the admin's phone is told why (once an hour per reason).
/// </summary>
public sealed class Subscribe : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/updates").MapPost("/subscribe", Handle).WithName("Subscribe").RequireRateLimiting(RateLimitPolicy);

    public static async Task<Results<Ok<SubscribeResult>, ValidationProblem, ProblemHttpResult>> Handle(
        SubscribeRequest request,
        PortfolioDbContext db,
        IEmailSender emails,
        IOptions<SiteOptions> site,
        IPhoneAlerts alerts,
        TimeProvider time,
        ILoggerFactory loggers,
        CancellationToken cancellationToken,
        Microsoft.Extensions.Caching.Hybrid.HybridCache? cache = null,
        IServiceProvider? services = null)
    {
        // Switched off in Settings ("Get updates"): not taking subscriptions.
        if (cache is not null && services is not null && !(await Site.SiteShared.LoadAsync(cache, services, cancellationToken)).Features["updates"])
        {
            return TypedResults.Problem("Email updates aren't open yet.", statusCode: StatusCodes.Status404NotFound);
        }

        var email = request.Email?.Trim().ToLowerInvariant() ?? "";
        if (email.Length == 0 || email.Length > ContactRules.EmailMaxLength || !ContactRules.IsEmail(email))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["email"] = ["Enter a valid email address."] });
        }

        var now = time.GetUtcNow();
        var subscriber = await db.Subscribers.FirstOrDefaultAsync(s => s.Email == email, cancellationToken);
        if (subscriber is { ConfirmedAt: not null }) return TypedResults.Ok(new SubscribeResult(SubscribeStatus.AlreadySubscribed));
        if (subscriber is not null && now - subscriber.ConfirmationSentAt < ConfirmationCooldown) return TypedResults.Ok(new SubscribeResult(SubscribeStatus.Pending));

        var isNew = subscriber is null;
        subscriber ??= db.Subscribers.Add(new Subscriber { Email = email, Token = NewToken(), CreatedAt = now }).Entity;
        subscriber.ConfirmationSentAt = now;
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException e) when (isNew && e.InnerException is Npgsql.PostgresException { SqlState: Npgsql.PostgresErrorCodes.UniqueViolation })
        {
            // The same new address, twice at once (a double click): the other request stored it and sends the email.
            return TypedResults.Ok(new SubscribeResult(SubscribeStatus.Pending));
        }

        try
        {
            var wording = await UpdateEmailsShared.LoadAsync(db, cancellationToken);
            await emails.SendAsync(UpdateEmails.Confirmation(email, subscriber.Token, wording, site.Value), cancellationToken);
        }
        catch (Exception e) when (!cancellationToken.IsCancellationRequested)
        {
            loggers.CreateLogger(typeof(UpdatesShared)).LogError(e, "Couldn't send the confirmation email.");
            // The visitor only hears it didn't work; the admin needs the reason (e.g. the sender's domain isn't verified).
            var reason = e is Settings.ServiceException ? e.Message : "The email service couldn't be reached.";
            alerts.SendThrottled($"email:{reason}", new PhoneAlert(AlertKinds.EmailFailing, "Emails aren't going out", $"A visitor couldn't subscribe. {reason}", "/settings", AlertPriority.High, "warning"));
            // Lets them try again at once.
            subscriber.ConfirmationSentAt = default;
            await db.SaveChangesAsync(CancellationToken.None);
            return TypedResults.Problem("The confirmation email couldn't be sent. Please try again later.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        return TypedResults.Ok(new SubscribeResult(SubscribeStatus.Sent));
    }
}
