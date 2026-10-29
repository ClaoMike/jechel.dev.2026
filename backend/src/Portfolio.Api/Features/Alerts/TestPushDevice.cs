using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Alerts;

/// <summary>A test notification to that device alone, whatever the switches say. 502 when its push service refused it (a device it no longer knows is forgotten).</summary>
public sealed class TestPushDevice : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/notifications").RequireAuthorization().MapPost("/push/devices/{id:int}/test", Handle).WithName("TestPushDevice");

    public static async Task<Results<NoContent, NotFound, ProblemHttpResult>> Handle(int id, PortfolioDbContext db, WebPushSender push, CancellationToken cancellationToken)
    {
        var device = await db.PushDevices.FindAsync([id], cancellationToken);
        if (device is null) return TypedResults.NotFound();
        var test = new PhoneAlert(AlertKinds.Test, "It works!", "Alerts from jechel.dev will arrive here.", "/notifications");
        var sent = await push.SendToAsync(db, device, test, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return sent ? TypedResults.NoContent() : TypedResults.Problem("The notification couldn't be sent to that device.", statusCode: StatusCodes.Status502BadGateway);
    }
}
