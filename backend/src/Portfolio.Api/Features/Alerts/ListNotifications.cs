using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Alerts.NotificationsShared;

namespace Portfolio.Api.Features.Alerts;

/// <summary>What was raised, newest first, of every kind or one; a page at a time.</summary>
public sealed class ListNotifications : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/notifications").RequireAuthorization().MapGet("/", Handle).WithName("ListNotifications");

    public static async Task<Ok<PagedResponse<NotificationDto>>> Handle(
        PortfolioDbContext db,
        CancellationToken cancellationToken,
        string? kind = null,
        int page = 1,
        int pageSize = DefaultPageSize)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = db.PhoneAlertLogs.AsNoTracking();
        if (!string.IsNullOrEmpty(kind)) query = query.Where(a => a.Kind == kind);

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(a => a.CreatedAt)
            .ThenByDescending(a => a.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new { a.Id, a.Kind, a.Title, a.Message, a.Path, a.Status, a.CreatedAt, a.SentTo })
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(new PagedResponse<NotificationDto>(
            [.. items.Select(a => new NotificationDto(a.Id, a.Kind, a.Title, a.Message, a.Path, a.Status, a.CreatedAt, a.SentTo is { Length: > 0 } to ? to.Split(',') : []))],
            page,
            pageSize,
            totalCount));
    }
}
