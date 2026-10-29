using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Updates.UpdatesShared;

namespace Portfolio.Api.Features.Updates;

/// <summary>Admin only. What was emailed, newest first.</summary>
public sealed class ListAnnouncements : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/updates").MapGet("/announcements", Handle).WithName("ListAnnouncements").RequireAuthorization();

    public static async Task<Ok<PagedResponse<AnnouncementDto>>> Handle(
        PortfolioDbContext db,
        CancellationToken cancellationToken,
        int page = 1,
        int pageSize = DefaultPageSize)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var totalCount = await db.Announcements.CountAsync(cancellationToken);
        var items = await db.Announcements
            .AsNoTracking()
            .OrderByDescending(a => a.CreatedAt)
            .ThenByDescending(a => a.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new AnnouncementDto(a.Id, a.Kind, a.Title, a.Status, a.CreatedAt, a.SentAt, a.RecipientCount))
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(new PagedResponse<AnnouncementDto>(items, page, pageSize, totalCount));
    }
}
