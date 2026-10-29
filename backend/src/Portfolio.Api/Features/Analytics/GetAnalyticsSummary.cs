using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Analytics.AnalyticsShared;

namespace Portfolio.Api.Features.Analytics;

/// <summary>
/// The period <paramref name="range"/> (see <see cref="AnalyticsRange.Names"/>; 30 days by default),
/// split into the chart's columns. Aggregated in memory: fine for a personal site's traffic; move
/// the grouping into SQL if it grows to millions of events.
/// </summary>
public sealed class GetAnalyticsSummary : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/analytics").MapGet("/summary", Handle).WithName("GetAnalyticsSummary").RequireAuthorization();

    public static async Task<Ok<AnalyticsSummary>> Handle(
        PortfolioDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken,
        string? range = AnalyticsRange.Default)
    {
        DateTimeOffset? firstVisit = range == "all"
            ? await db.VisitSessions.OrderBy(s => s.StartedAt).Select(s => (DateTimeOffset?)s.StartedAt).FirstOrDefaultAsync(cancellationToken)
            : null;
        var period = AnalyticsRange.Plan(range, time.GetUtcNow(), firstVisit);
        var from = period.From;

        var sessions = await db.VisitSessions
            .AsNoTracking()
            .Where(s => s.StartedAt >= from)
            .Select(s => new
            {
                s.StartedAt,
                s.LastSeenAt,
                s.VisitorHash,
                s.PageViews,
                s.InteractionCount,
                s.ReferrerHost,
                s.UtmSource,
                s.Device,
                s.Browser,
                s.TimeZone,
                s.Country,
                s.Theme,
                s.LastTheme,
            })
            .ToListAsync(cancellationToken);

        var events = await db.VisitEvents
            .AsNoTracking()
            .Where(e => e.OccurredAt >= from && (e.Type == "pageview" || e.Type == "click" || e.Type == "error"))
            .Select(e => new { e.Type, e.Path, e.Label, e.OccurredAt })
            .ToListAsync(cancellationToken);

        var siteEvents = await db.VisitEvents
            .AsNoTracking()
            .Where(e => e.OccurredAt >= from && e.Type == "event")
            .Select(e => new { e.Label, e.Detail })
            .ToListAsync(cancellationToken);
        var themeChanges = siteEvents.Where(e => e.Label == AnalyticsRules.ThemeChangedEvent && e.Detail != null).Select(e => e.Detail!);

        var sessionsByBucket = sessions.ToLookup(s => period.BucketOf(s.StartedAt));
        var pageViews = events.Where(e => e.Type == "pageview").ToList();
        var errors = events.Where(e => e.Type == "error").ToList();
        var pageViewsByBucket = pageViews.ToLookup(e => period.BucketOf(e.OccurredAt));
        var errorsByBucket = errors.ToLookup(e => period.BucketOf(e.OccurredAt));

        // A visitor's id changes every UTC day, so a column counts the distinct (day, visitor) pairs in it.
        static int Visitors<T>(IEnumerable<T> rows, Func<T, DateTimeOffset> startedAt, Func<T, string> hash) =>
            rows.Select(r => (DateOnly.FromDateTime(startedAt(r).UtcDateTime), hash(r))).Distinct().Count();

        var series = period.Buckets
            .Select(start => new SeriesPoint(
                start,
                Visitors(sessionsByBucket[start], s => s.StartedAt, s => s.VisitorHash),
                sessionsByBucket[start].Count(),
                pageViewsByBucket[start].Count(),
                errorsByBucket[start].Count()))
            .ToList();

        var totals = new AnalyticsTotals(
            Visitors: Visitors(sessions, s => s.StartedAt, s => s.VisitorHash),
            Sessions: sessions.Count,
            PageViews: pageViews.Count,
            AverageSessionSeconds: sessions.Count == 0 ? 0 : sessions.Average(s => (s.LastSeenAt - s.StartedAt).TotalSeconds),
            BounceRate: sessions.Count == 0 ? 0 : sessions.Count(s => s.PageViews <= 1 && s.InteractionCount == 0) / (double)sessions.Count,
            Errors: errors.Count);

        return TypedResults.Ok(new AnalyticsSummary(
            period.Name,
            period.BucketSize,
            from,
            totals,
            series,
            TopPages: Top(pageViews.Select(e => WithoutQuery(e.Path))),
            Referrers: Top(sessions.Select(s => s.ReferrerHost ?? s.UtmSource ?? "Direct")),
            Devices: Top(sessions.Select(s => s.Device)),
            Browsers: Top(sessions.Select(s => s.Browser)),
            TimeZones: Top(sessions.Select(s => s.TimeZone ?? "Unknown")),
            Countries: Top(sessions.Select(s => s.Country ?? "Unknown")),
            TopClicks: Top(events.Where(e => e.Type == "click" && e.Label is not null).Select(e => e.Label!)),
            TopErrors: Top(errors.Select(e => e.Label ?? "Unknown error")),
            Themes: Top(sessions.Select(s => s.LastTheme ?? s.Theme ?? "Unknown")),
            ThemeSwitches: Top(themeChanges.Select(ThemeSwitch).OfType<string>()),
            // Theme changes have their own list.
            SiteEvents: Top(siteEvents.Where(e => e.Label is not null && e.Label != AnalyticsRules.ThemeChangedEvent).Select(e => e.Label!))));
    }
}
