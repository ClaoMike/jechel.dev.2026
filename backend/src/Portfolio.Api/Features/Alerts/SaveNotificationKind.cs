using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Alerts.NotificationsShared;

namespace Portfolio.Api.Features.Alerts;

/// <summary>Switches one kind on or off; it applies to the next alert. Every kind, as it now is.</summary>
public sealed class SaveNotificationKind : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/notifications").RequireAuthorization().MapPut("/kinds/{kind}", Handle).WithName("SaveNotificationKind");

    public static async Task<Results<Ok<IReadOnlyList<NotificationKindDto>>, NotFound, ValidationProblem>> Handle(
        string kind,
        SaveNotificationKindRequest request,
        PortfolioDbContext db,
        AlertPreferences preferences,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        if (AlertKinds.Find(kind) is null) return TypedResults.NotFound();
        if (request?.Enabled is not { } enabled) return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["enabled"] = ["Say whether it's on: true or false."] });

        var row = await db.AlertPreferences.FindAsync([kind], cancellationToken);
        if (row is null)
        {
            row = new AlertPreference { Kind = kind };
            db.AlertPreferences.Add(row);
        }
        row.Enabled = enabled;
        row.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);
        await preferences.ReloadAsync(db, cancellationToken);

        return TypedResults.Ok(await LoadKindsAsync(db, time, cancellationToken));
    }
}
