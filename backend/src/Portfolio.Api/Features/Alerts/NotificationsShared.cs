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
/// <param name="SentTo">Where it went, once sent: <see cref="AlertChannels"/>, in order; empty when it wasn't.</param>
public record NotificationDto(long Id, string Kind, string Title, string Message, string? Path, string Status, DateTimeOffset CreatedAt, IReadOnlyList<string> SentTo);

/// <summary>The admin's Notifications tab: every kind of phone alert, switched on or off, and the history of what was raised.</summary>
public static class NotificationsShared
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 50;

    /// <summary>Every kind of phone alert: whether it's on, how many went out in the last 30 days, and the last one.</summary>
    internal static async Task<IReadOnlyList<NotificationKindDto>> LoadKindsAsync(PortfolioDbContext db, TimeProvider time, CancellationToken cancellationToken)
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

        return [.. AlertKinds.All.Select(k => new NotificationKindDto(
            k.Key,
            k.Label,
            k.Group,
            !off.Contains(k.Key),
            recent.GetValueOrDefault(k.Key),
            last.TryGetValue(k.Key, out var at) ? at : null))];
    }
}
