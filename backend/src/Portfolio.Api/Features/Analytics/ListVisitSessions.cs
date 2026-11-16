using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Analytics.AnalyticsShared;

namespace Portfolio.Api.Features.Analytics;

/// <summary>Newest first. <paramref name="errorsOnly"/> keeps the visits that hit an error.</summary>
public sealed class ListVisitSessions : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/analytics").MapGroup("/sessions").RequireAuthorization().MapGet("/", Handle).WithName("ListVisitSessions");

    public static async Task<Ok<PagedResponse<SessionSummary>>> Handle(
        PortfolioDbContext db,
        CancellationToken cancellationToken,
        int page = 1,
        int pageSize = DefaultPageSize,
        bool errorsOnly = false)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = db.VisitSessions.AsNoTracking();
        if (errorsOnly) query = query.Where(s => s.ErrorCount > 0);

        var totalCount = await query.CountAsync(cancellationToken);
        var rows = await query
            .OrderByDescending(s => s.StartedAt)
            .ThenBy(s => s.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var items = rows
            .Select(s => new SessionSummary(
                s.Id,
                s.StartedAt,
                (int)(s.LastSeenAt - s.StartedAt).TotalSeconds,
                s.PageViews,
                s.EventCount,
                s.ErrorCount,
                s.EntryPath,
                s.ReferrerHost,
                s.Device,
                s.Browser,
                s.OperatingSystem,
                s.TimeZone,
                s.Theme,
                s.LastTheme))
            .ToList();

        return TypedResults.Ok(new PagedResponse<SessionSummary>(items, page, pageSize, totalCount));
    }
}
