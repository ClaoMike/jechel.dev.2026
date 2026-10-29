using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Apps.AppShared;

namespace Portfolio.Api.Features.Apps;

/// <summary>Public. The first app in the order that What's new? may show, or none.</summary>
public sealed class GetWhatsNewApp : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/apps").MapGet("/whats-new", Handle).WithName("GetWhatsNewApp");

    public static async Task<Ok<WhatsNewApp>> Handle(PortfolioDbContext db, CancellationToken cancellationToken)
    {
        var entry = await db.Apps.AsNoTracking().Where(a => a.ShowInWhatsNew).InOrder().FirstOrDefaultAsync(cancellationToken);
        if (entry is null) return TypedResults.Ok(new WhatsNewApp(null));
        return TypedResults.Ok(new WhatsNewApp(ToDetails(entry, await LoadCategoriesAsync(db, cancellationToken))));
    }
}
