using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Alerts.PushShared;

namespace Portfolio.Api.Features.Alerts;

/// <summary>Switches one way on or off; it applies to the next alert. Every way, as it now is.</summary>
public sealed class SaveAlertChannel : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/notifications").RequireAuthorization().MapPut("/channels/{channel}", Handle).WithName("SaveAlertChannel");

    public static async Task<Results<Ok<IReadOnlyList<AlertChannelDto>>, NotFound, ValidationProblem>> Handle(
        string channel,
        SaveAlertChannelRequest request,
        PortfolioDbContext db,
        AlertPreferences preferences,
        IOptionsMonitor<AlertOptions> ntfy,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        if (!AlertChannels.All.Contains(channel)) return TypedResults.NotFound();
        if (request?.Enabled is not { } enabled) return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["enabled"] = ["Say whether it's on: true or false."] });

        var row = await db.AlertChannels.FindAsync([channel], cancellationToken);
        if (row is null)
        {
            row = new AlertChannelSetting { Channel = channel };
            db.AlertChannels.Add(row);
        }
        row.Enabled = enabled;
        row.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);
        await preferences.ReloadAsync(db, cancellationToken);

        return TypedResults.Ok(await LoadChannelsAsync(db, ntfy, cancellationToken));
    }
}
