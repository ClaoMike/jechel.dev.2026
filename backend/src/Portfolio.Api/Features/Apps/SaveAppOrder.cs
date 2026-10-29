using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Apps.AppShared;

namespace Portfolio.Api.Features.Apps;

/// <summary>
/// Admin only. Saves the order (every app, each once, top first) and which apps What's new? may show.
/// Positions are numbered afresh from 0.
/// </summary>
public sealed class SaveAppOrder : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/apps").MapPut("/order", Handle).WithName("SaveAppOrder").RequireAuthorization();

    public static async Task<Results<Ok<IReadOnlyList<AppOrderItem>>, ValidationProblem>> Handle(
        IReadOnlyList<AppOrderRequest?> request,
        PortfolioDbContext db,
        CancellationToken cancellationToken)
    {
        var apps = await db.Apps.ToDictionaryAsync(a => a.Id, cancellationToken);
        var errors = AppRules.ValidateOrder(request, apps.Keys);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        for (var i = 0; i < request.Count; i++)
        {
            var app = apps[request[i]!.Id!.Value];
            app.Position = i;
            app.ShowInWhatsNew = request[i]!.ShowInWhatsNew!.Value;
        }
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            // An app was deleted after the check above (another tab): out of date, as if it had been gone already.
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { [""] = [AppRules.OrderOutOfDate] });
        }
        return TypedResults.Ok(await LoadOrderAsync(db, cancellationToken));
    }
}
