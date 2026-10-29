using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;
using Microsoft.Extensions.Options;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using static Portfolio.Api.Features.Site.SiteShared;

namespace Portfolio.Api.Features.Site;

/// <summary>Admin only. Changes what's given; the rest stays.</summary>
public sealed class SaveSiteStatus : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/site").MapPut("/", Handle).WithName("SaveSiteStatus").RequireAuthorization();

    public static async Task<Results<Ok<SiteStatus>, ValidationProblem>> Handle(
        SaveSiteRequest request,
        PortfolioDbContext db,
        HybridCache cache,
        IOptions<SiteOptions> options,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.Pages?.Keys.Any(k => !SiteParts.Pages.Contains(k)) == true) errors["pages"] = ["Unknown page."];
        if (request.Features?.Keys.Any(k => !SiteParts.Features.Contains(k)) == true) errors["features"] = ["Unknown feature."];
        if ((request.MaintenanceMessage?.Trim().Length ?? 0) > MessageMaxLength) errors["maintenanceMessage"] = [$"At most {MessageMaxLength} characters."];
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var row = await db.SiteStates.FindAsync([SiteState.SingletonId], cancellationToken);
        if (row is null)
        {
            row = new SiteState { Id = SiteState.SingletonId };
            db.SiteStates.Add(row);
        }
        var current = ToStatus(row, options.Value.PagesVisibleByDefault);
        row.Pages = JsonSerializer.Serialize(Merge(current.Pages, request.Pages), Json);
        row.Features = JsonSerializer.Serialize(Merge(current.Features, request.Features), Json);
        if (request.Maintenance is { } maintenance) row.MaintenanceEnabled = maintenance;
        if (request.MaintenanceMessage is { } message) row.MaintenanceMessage = message.Trim();
        row.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);

        await cache.RemoveAsync(CacheKey, cancellationToken);
        return TypedResults.Ok(ToStatus(row, options.Value.PagesVisibleByDefault));
    }
}
