using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Alerts.PushShared;

namespace Portfolio.Api.Features.Alerts;

/// <summary>
/// A device allowed notifications: kept, or updated when it's known already (a browser allowing them again keeps its
/// address, maybe with new keys). Every device, as they now are.
/// </summary>
public sealed class AddPushDevice : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/notifications").RequireAuthorization().MapPost("/push/devices", Handle).WithName("AddPushDevice");

    public static async Task<Results<Ok<IReadOnlyList<PushDeviceDto>>, ValidationProblem>> Handle(
        AddPushDeviceRequest request,
        PortfolioDbContext db,
        IHostEnvironment environment,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var errors = Validate(request, environment);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var endpoint = request.Endpoint!.Trim();
        var device = await db.PushDevices.FirstOrDefaultAsync(d => d.Endpoint == endpoint, cancellationToken);
        if (device is null)
        {
            device = new PushDevice { Endpoint = endpoint, P256dh = "", Auth = "", Label = "", CreatedAt = time.GetUtcNow() };
            db.PushDevices.Add(device);
        }
        device.P256dh = request.Keys!.P256dh!.Trim();
        device.Auth = request.Keys.Auth!.Trim();
        device.Label = NtfySender.Cut(string.IsNullOrWhiteSpace(request.Label) ? "A browser" : request.Label.Trim(), LabelMaxLength);
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.Ok(await DevicesAsync(db, cancellationToken));
    }
}
