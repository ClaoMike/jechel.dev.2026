using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using static Portfolio.Api.Features.Updates.UpdatesShared;

namespace Portfolio.Api.Features.Updates;

/// <summary>The link in the confirmation email. Idempotent; 404 for an unknown token (e.g. they unsubscribed since).</summary>
public sealed class ConfirmSubscription : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/updates").MapPost("/confirm", Handle).WithName("ConfirmSubscription");

    public static async Task<Results<Ok<ConfirmedSubscription>, NotFound>> Handle(
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
            alerts.Send(new PhoneAlert(AlertKinds.Subscriber, "New subscriber", $"{subscriber.Email} ({total} in all)", "/community", AlertPriority.Low, "bell"));
        }
        return TypedResults.Ok(new ConfirmedSubscription(subscriber.Email));
    }
}
