using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Apps.AppShared;

namespace Portfolio.Api.Features.Apps;

/// <summary>Public. In the admin's order (Organise); a new app goes first.</summary>
public sealed class ListApps : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/apps").MapGet("/", Handle).WithName("ListApps");

    public static async Task<Ok<PagedResponse<AppDetails>>> Handle(
        PortfolioDbContext db,
        CancellationToken cancellationToken,
        int page = 1,
        int pageSize = DefaultPageSize)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var totalCount = await db.Apps.CountAsync(cancellationToken);
        var rows = await db.Apps
            .AsNoTracking()
            .InOrder()
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);
        var categories = await LoadCategoriesAsync(db, cancellationToken);

        return TypedResults.Ok(new PagedResponse<AppDetails>([.. rows.Select(r => ToDetails(r, categories))], page, pageSize, totalCount));
    }
}
