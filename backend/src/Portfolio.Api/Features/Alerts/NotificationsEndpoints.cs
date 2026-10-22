using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Alerts;

/// <param name="Group">The heading it's listed under, e.g. "Visitors".</param>
/// <param name="Last30Days">How many were raised in the last 30 days, sent or not.</param>
/// <param name="LastAt">When the last one was raised; null when none has been.</param>
public record NotificationKindDto(string Kind, string Label, string Group, bool Enabled, int Last30Days, DateTimeOffset? LastAt);

/// <param name="Enabled">Required: a body without it is refused, never read as "off".</param>
public record SaveNotificationKindRequest(bool? Enabled);

/// <param name="Status">One of <see cref="AlertStatus"/>.</param>
public record NotificationDto(long Id, string Kind, string Title, string Message, string? Path, string Status, DateTimeOffset CreatedAt);

/// <summary>The admin's Notifications tab: every kind of phone alert, switched on or off, and the history of what was raised.</summary>
public static class NotificationsEndpoints
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 50;

    public static IEndpointRouteBuilder MapNotificationsEndpoints(this IEndpointRouteBuilder app)
    {
        var notifications = app.MapGroup("/notifications").RequireAuthorization();

        notifications.MapGet("/", ListNotifications).WithName("ListNotifications");
        notifications.MapGet("/kinds", ListKinds).WithName("ListNotificationKinds");
        notifications.MapPut("/kinds/{kind}", SaveKind).WithName("SaveNotificationKind");

        return app;
    }

    /// <summary>Every kind, in the catalog's order, with whether it's on and how often it came lately.</summary>
    public static async Task<Ok<IReadOnlyList<NotificationKindDto>>> ListKinds(PortfolioDbContext db, TimeProvider time, CancellationToken cancellationToken)
    {
        var since = time.GetUtcNow().AddDays(-30);
        var off = (await db.AlertPreferences.AsNoTracking().Where(p => !p.Enabled).Select(p => p.Kind).ToListAsync(cancellationToken)).ToHashSet();
        var recent = (await db.PhoneAlertLogs.AsNoTracking()
                .Where(a => a.CreatedAt >= since)
                .GroupBy(a => a.Kind)
                .Select(g => new { Kind = g.Key, Count = g.Count() })
                .ToListAsync(cancellationToken))
            .ToDictionary(r => r.Kind, r => r.Count);
        var last = (await db.PhoneAlertLogs.AsNoTracking()
                .GroupBy(a => a.Kind)
                .Select(g => new { Kind = g.Key, At = g.Max(a => a.CreatedAt) })
                .ToListAsync(cancellationToken))
            .ToDictionary(r => r.Kind, r => r.At);

        IReadOnlyList<NotificationKindDto> kinds = [.. AlertKinds.All.Select(k => new NotificationKindDto(
            k.Key,
            k.Label,
            k.Group,
            !off.Contains(k.Key),
            recent.GetValueOrDefault(k.Key),
            last.TryGetValue(k.Key, out var at) ? at : null))];
        return TypedResults.Ok(kinds);
    }

    /// <summary>Switches one kind on or off; it applies to the next alert. Every kind, as it now is.</summary>
    public static async Task<Results<Ok<IReadOnlyList<NotificationKindDto>>, NotFound, ValidationProblem>> SaveKind(
        string kind,
        SaveNotificationKindRequest request,
        PortfolioDbContext db,
        AlertPreferences preferences,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        if (AlertKinds.Find(kind) is null) return TypedResults.NotFound();
        if (request?.Enabled is not { } enabled) return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["enabled"] = ["Say whether it's on: true or false."] });

        var row = await db.AlertPreferences.FindAsync([kind], cancellationToken);
        if (row is null)
        {
            row = new AlertPreference { Kind = kind };
            db.AlertPreferences.Add(row);
        }
        row.Enabled = enabled;
        row.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);
        await preferences.ReloadAsync(db, cancellationToken);

        return TypedResults.Ok((await ListKinds(db, time, cancellationToken)).Value!);
    }

    /// <summary>What was raised, newest first, of every kind or one; a page at a time.</summary>
    public static async Task<Ok<PagedResponse<NotificationDto>>> ListNotifications(
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
            .Select(a => new NotificationDto(a.Id, a.Kind, a.Title, a.Message, a.Path, a.Status, a.CreatedAt))
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(new PagedResponse<NotificationDto>(items, page, pageSize, totalCount));
    }
}
