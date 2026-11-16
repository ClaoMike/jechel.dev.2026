using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Analytics.AnalyticsShared;

namespace Portfolio.Api.Features.Analytics;

/// <summary>
/// The period <paramref name="range"/> (see <see cref="AnalyticsRange.Names"/>; 30 days by default),
/// split into the chart's columns. Visits are loaded (one small row each); their events are counted as they
/// stream from the database, so the memory used doesn't grow with how many there are.
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

        // Events are counted as they're read, never held: a year of visits is millions of rows, and the server has 1 GB.
        // Only what's counted is asked for (an error's stack stays in the database).
        var pageViewsByBucket = new Dictionary<DateTimeOffset, int>();
        var errorsByBucket = new Dictionary<DateTimeOffset, int>();
        var topPages = new Dictionary<string, int>();
        var topClicks = new Dictionary<string, int>();
        var topErrors = new Dictionary<string, int>();
        var siteEvents = new Dictionary<string, int>();
        var themeSwitches = new Dictionary<string, int>();
        var pageViewCount = 0;
        var errorCount = 0;

        var events = db.VisitEvents
            .AsNoTracking()
            .Where(e => e.OccurredAt >= from && (e.Type == "pageview" || e.Type == "click" || e.Type == "error" || e.Type == "event"))
            .Select(e => new
            {
                e.Type,
                e.Path,
                e.Label,
                e.OccurredAt,
                // A theme change says from what to what.
                Detail = e.Type == "event" && e.Label == AnalyticsRules.ThemeChangedEvent ? e.Detail : null,
            })
            .AsAsyncEnumerable();
        await foreach (var e in events.WithCancellation(cancellationToken))
        {
            switch (e.Type)
            {
                case "pageview":
                    pageViewCount++;
                    Count(pageViewsByBucket, period.BucketOf(e.OccurredAt));
                    Count(topPages, WithoutQuery(e.Path));
                    break;
                case "click":
                    if (e.Label is not null) Count(topClicks, e.Label);
                    break;
                case "error":
                    errorCount++;
                    Count(errorsByBucket, period.BucketOf(e.OccurredAt));
                    Count(topErrors, e.Label ?? "Unknown error");
                    break;
                // Theme changes have their own list.
                case "event" when e.Label == AnalyticsRules.ThemeChangedEvent:
                    if (e.Detail is not null && ThemeSwitch(e.Detail) is { } change) Count(themeSwitches, change);
                    break;
                case "event":
                    if (e.Label is not null) Count(siteEvents, e.Label);
                    break;
            }
        }

        var sessionsByBucket = sessions.ToLookup(s => period.BucketOf(s.StartedAt));

        // A visitor's id changes every UTC day, so a column counts the distinct (day, visitor) pairs in it.
        static int Visitors<T>(IEnumerable<T> rows, Func<T, DateTimeOffset> startedAt, Func<T, string> hash) =>
            rows.Select(r => (DateOnly.FromDateTime(startedAt(r).UtcDateTime), hash(r))).Distinct().Count();

        var series = period.Buckets
            .Select(start => new SeriesPoint(
                start,
                Visitors(sessionsByBucket[start], s => s.StartedAt, s => s.VisitorHash),
                sessionsByBucket[start].Count(),
                pageViewsByBucket.GetValueOrDefault(start),
                errorsByBucket.GetValueOrDefault(start)))
            .ToList();

        var totals = new AnalyticsTotals(
            Visitors: Visitors(sessions, s => s.StartedAt, s => s.VisitorHash),
            Sessions: sessions.Count,
            PageViews: pageViewCount,
            AverageSessionSeconds: sessions.Count == 0 ? 0 : sessions.Average(s => (s.LastSeenAt - s.StartedAt).TotalSeconds),
            BounceRate: sessions.Count == 0 ? 0 : sessions.Count(s => s.PageViews <= 1 && s.InteractionCount == 0) / (double)sessions.Count,
            Errors: errorCount);

        return TypedResults.Ok(new AnalyticsSummary(
            period.Name,
            period.BucketSize,
            from,
            totals,
            series,
            TopPages: Top(topPages),
            Referrers: Top(sessions.Select(s => s.ReferrerHost ?? s.UtmSource ?? "Direct")),
            Devices: Top(sessions.Select(s => s.Device)),
            Browsers: Top(sessions.Select(s => s.Browser)),
            TimeZones: Top(sessions.Select(s => s.TimeZone ?? "Unknown")),
            Countries: Top(sessions.Select(s => s.Country ?? "Unknown")),
            TopClicks: Top(topClicks),
            TopErrors: Top(topErrors),
            Themes: Top(sessions.Select(s => s.LastTheme ?? s.Theme ?? "Unknown")),
            ThemeSwitches: Top(themeSwitches),
            SiteEvents: Top(siteEvents)));
    }
}
