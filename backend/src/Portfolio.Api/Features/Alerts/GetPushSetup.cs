using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Alerts.PushShared;

namespace Portfolio.Api.Features.Alerts;

/// <summary>The site's key (made the first time) and the devices that allowed notifications, the newest first.</summary>
public sealed class GetPushSetup : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/notifications").RequireAuthorization().MapGet("/push", Handle).WithName("GetPushSetup");

    public static async Task<Ok<PushSetupDto>> Handle(PortfolioDbContext db, WebPushSender push, CancellationToken cancellationToken)
    {
        var keys = await push.KeysAsync(cancellationToken);
        return TypedResults.Ok(new PushSetupDto(keys.PublicKey, await DevicesAsync(db, cancellationToken)));
    }
}
