using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Alerts.PushShared;

namespace Portfolio.Api.Features.Alerts;

public sealed class RemovePushDevice : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/notifications").RequireAuthorization().MapDelete("/push/devices/{id:int}", Handle).WithName("RemovePushDevice");

    public static async Task<Results<Ok<IReadOnlyList<PushDeviceDto>>, NotFound>> Handle(int id, PortfolioDbContext db, CancellationToken cancellationToken)
    {
        var device = await db.PushDevices.FindAsync([id], cancellationToken);
        if (device is null) return TypedResults.NotFound();
        db.PushDevices.Remove(device);
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(await DevicesAsync(db, cancellationToken));
    }
}
