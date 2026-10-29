using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Alerts.NotificationsShared;

namespace Portfolio.Api.Features.Alerts;

/// <summary>Every kind, in the catalog's order, with whether it's on and how often it came lately.</summary>
public sealed class ListNotificationKinds : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/notifications").RequireAuthorization().MapGet("/kinds", Handle).WithName("ListNotificationKinds");

    public static async Task<Ok<IReadOnlyList<NotificationKindDto>>> Handle(PortfolioDbContext db, TimeProvider time, CancellationToken cancellationToken) =>
        TypedResults.Ok(await LoadKindsAsync(db, time, cancellationToken));
}
