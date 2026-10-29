using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Apps.AppShared;

namespace Portfolio.Api.Features.Apps;

/// <summary>Admin only. Every app, in the order (Organise): its name, and whether What's new? may show it.</summary>
public sealed class ListAppOrder : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/apps").MapGet("/order", Handle).WithName("ListAppOrder").RequireAuthorization();

    public static async Task<Ok<IReadOnlyList<AppOrderItem>>> Handle(PortfolioDbContext db, CancellationToken cancellationToken) =>
        TypedResults.Ok(await LoadOrderAsync(db, cancellationToken));
}
