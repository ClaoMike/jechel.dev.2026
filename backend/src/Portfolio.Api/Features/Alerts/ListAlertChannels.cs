using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Alerts.PushShared;

namespace Portfolio.Api.Features.Alerts;

public sealed class ListAlertChannels : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/notifications").RequireAuthorization().MapGet("/channels", Handle).WithName("ListAlertChannels");

    public static async Task<Ok<IReadOnlyList<AlertChannelDto>>> Handle(PortfolioDbContext db, IOptionsMonitor<AlertOptions> ntfy, CancellationToken cancellationToken) =>
        TypedResults.Ok(await LoadChannelsAsync(db, ntfy, cancellationToken));
}
