using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Updates.UpdatesShared;

namespace Portfolio.Api.Features.Updates;

/// <summary>Admin only. Newest first, confirmed or not.</summary>
public sealed class ListSubscribers : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/updates").MapGet("/subscribers", Handle).WithName("ListSubscribers").RequireAuthorization();

    public static async Task<Ok<PagedResponse<SubscriberDto>>> Handle(
        PortfolioDbContext db,
        CancellationToken cancellationToken,
        int page = 1,
        int pageSize = DefaultPageSize)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var totalCount = await db.Subscribers.CountAsync(cancellationToken);
        var items = await db.Subscribers
            .AsNoTracking()
            .OrderByDescending(s => s.CreatedAt)
            .ThenByDescending(s => s.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(s => new SubscriberDto(s.Id, s.Email, s.CreatedAt, s.ConfirmedAt))
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(new PagedResponse<SubscriberDto>(items, page, pageSize, totalCount));
    }
}
