using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;

namespace Portfolio.Api.Features.Analytics;

/// <summary>
/// Visitor analytics, recorded by the site itself (no third parties, no cookies): the browser's
/// tracker sends what a visit does, and the admin's Engagement tab reads it back.
/// </summary>
public static class AnalyticsEndpoints
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 50;
    public const int TopListSize = 10;

    private static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;

    public static IEndpointRouteBuilder MapAnalyticsEndpoints(this IEndpointRouteBuilder app)
    {
        var analytics = app.MapGroup("/analytics");

        // Public: every visitor's browser sends its events here.
        analytics.MapPost("/events", Collect).WithName("CollectAnalyticsEvents");

        // Admin only: the Engagement tab.
        analytics.MapGet("/summary", GetSummary).WithName("GetAnalyticsSummary").RequireAuthorization();
        var sessions = analytics.MapGroup("/sessions").RequireAuthorization();
        sessions.MapGet("/", ListSessions).WithName("ListVisitSessions");
        sessions.MapGet("/{id:guid}", GetSession).WithName("GetVisitSession");
        sessions.MapDelete("/{id:guid}", DeleteSession).WithName("DeleteVisitSession");

        return app;
    }

    /// <summary>
    /// Records a batch of a visit's events. Always 204, even when nothing is stored: the signed-in
    /// admin, bots, events past the visit's limit, and events already stored (same sequence number).
    /// </summary>
    public static async Task<Results<NoContent, ValidationProblem>> Collect(
        CollectRequest request,
        HttpContext http,
        PortfolioDbContext db,
        VisitorHasher visitors,
        TimeProvider time,
        IPhoneAlerts alerts,
        CancellationToken cancellationToken)
    {
        if (request.SessionId == Guid.Empty)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["sessionId"] = ["A session id is required."] });
        }

        // The admin's own browsing would only skew the numbers.
        if (http.User.Identity?.IsAuthenticated == true) return TypedResults.NoContent();

        var userAgent = http.Request.Headers.UserAgent.ToString();
        var agent = AnalyticsRules.ParseUserAgent(userAgent);
        if (agent.IsBot) return TypedResults.NoContent();

        var now = time.GetUtcNow();
        var events = (request.Events ?? [])
            .Take(AnalyticsRules.MaxEventsPerBatch)
            .Where(e => e.Seq > 0 && e.Type is not null && AnalyticsRules.EventTypes.Contains(e.Type))
            .DistinctBy(e => e.Seq)
            .Select(e => (Input: e, OccurredAt: OccurredAt(e, now)))
            .ToList();

        // Two batches of a new visit can arrive together (a timed send and the one sent as the tab
        // closes): the second insert of the visit fails, so it's tried once more against the stored one.
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                var errors = await StoreAsync(request, events, http, agent, userAgent, db, visitors, now, cancellationToken);
                // Once stored, so a retried batch doesn't ring twice; throttled, so a crash every visitor hits rings once an hour.
                foreach (var (label, path) in errors)
                {
                    alerts.SendThrottled($"web:{label}", new PhoneAlert("Site error", $"{label}\non {path} ({agent.Browser}, {agent.Device})", "/engagement", AlertPriority.Default, "warning"));
                }
                return TypedResults.NoContent();
            }
            catch (DbUpdateException) when (attempt == 1)
            {
                db.ChangeTracker.Clear();
            }
        }
    }

    private static DateTimeOffset OccurredAt(EventInput input, DateTimeOffset now)
    {
        var age = TimeSpan.FromMilliseconds(Math.Max(0, input.AgeMs));
        return age > AnalyticsRules.MaxEventAge ? now : now - age;
    }

    /// <summary>Returns the errors it stored (label and page), to alert the phone about.</summary>
    private static async Task<List<(string Label, string Path)>> StoreAsync(
        CollectRequest request,
        List<(EventInput Input, DateTimeOffset OccurredAt)> events,
        HttpContext http,
        AnalyticsRules.UserAgentInfo agent,
        string userAgent,
        PortfolioDbContext db,
        VisitorHasher visitors,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var errors = new List<(string Label, string Path)>();
        var session = await db.VisitSessions.FindAsync([request.SessionId], cancellationToken);
        if (session is null)
        {
            var info = request.Session ?? new SessionInfo(null, null, null, null, 0, 0, 0, 0, null);
            var entryPath = AnalyticsRules.NormalizePath(info.Path);
            var (referrer, referrerHost) = AnalyticsRules.NormalizeReferrer(info.Referrer, http.Request.Host.Host);
            var (utmSource, utmMedium, utmCampaign) = AnalyticsRules.ReadUtm(entryPath);
            var startedAt = events.Count > 0 ? events.Min(e => e.OccurredAt) : now;

            session = new VisitSession
            {
                Id = request.SessionId,
                VisitorHash = visitors.Hash(http.Connection.RemoteIpAddress?.ToString(), userAgent),
                StartedAt = startedAt,
                LastSeenAt = startedAt,
                EntryPath = entryPath,
                Referrer = referrer,
                ReferrerHost = referrerHost,
                UtmSource = utmSource,
                UtmMedium = utmMedium,
                UtmCampaign = utmCampaign,
                UserAgent = AnalyticsRules.Cut(userAgent, AnalyticsRules.UserAgentMaxLength) ?? "",
                Device = agent.Device,
                Browser = agent.Browser,
                OperatingSystem = agent.OperatingSystem,
                Country = AnalyticsRules.NormalizeCountry(http.Request.Headers["CF-IPCountry"].ToString()),
                Language = AnalyticsRules.Cut(info.Language, 35),
                TimeZone = AnalyticsRules.Cut(info.TimeZone, 64),
                ScreenWidth = Math.Clamp(info.ScreenWidth, 0, 100_000),
                ScreenHeight = Math.Clamp(info.ScreenHeight, 0, 100_000),
                ViewportWidth = Math.Clamp(info.ViewportWidth, 0, 100_000),
                ViewportHeight = Math.Clamp(info.ViewportHeight, 0, 100_000),
                Theme = AnalyticsRules.Cut(info.Theme, AnalyticsRules.ThemeMaxLength),
            };
            db.VisitSessions.Add(session);
        }

        // Every batch says the theme on show, so the last one (sent as the tab closes) says where the visit ended.
        session.LastTheme = AnalyticsRules.Cut(request.Session?.CurrentTheme ?? request.Session?.Theme, AnalyticsRules.ThemeMaxLength) ?? session.LastTheme ?? session.Theme;

        if (events.Count > 0 && session.EventCount < AnalyticsRules.MaxEventsPerSession)
        {
            var sequences = events.Select(e => e.Input.Seq).ToList();
            var stored = await db.VisitEvents
                .Where(e => e.SessionId == session.Id && sequences.Contains(e.Sequence))
                .Select(e => e.Sequence)
                .ToListAsync(cancellationToken);

            foreach (var (input, occurredAt) in events.Where(e => !stored.Contains(e.Input.Seq)))
            {
                if (session.EventCount >= AnalyticsRules.MaxEventsPerSession) break;

                var detail = AnalyticsRules.NormalizeDetail(input.Detail);
                db.VisitEvents.Add(new VisitEvent
                {
                    SessionId = session.Id,
                    Sequence = input.Seq,
                    OccurredAt = occurredAt,
                    Type = input.Type!,
                    Path = AnalyticsRules.NormalizePath(input.Path),
                    Label = AnalyticsRules.Cut(input.Label, AnalyticsRules.LabelMaxLength),
                    Detail = detail is null ? null : JsonSerializer.Serialize(detail, Json),
                });

                session.EventCount++;
                if (input.Type == "pageview") session.PageViews++;
                if (input.Type == "error")
                {
                    session.ErrorCount++;
                    errors.Add((AnalyticsRules.Cut(input.Label, AnalyticsRules.LabelMaxLength) ?? "Unknown error", AnalyticsRules.NormalizePath(input.Path)));
                }
                if (AnalyticsRules.InteractionTypes.Contains(input.Type!)) session.InteractionCount++;
                if (occurredAt > session.LastSeenAt) session.LastSeenAt = occurredAt;
                if (occurredAt < session.StartedAt) session.StartedAt = occurredAt;
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        return errors;
    }

    /// <summary>
    /// The period <paramref name="range"/> (see <see cref="AnalyticsRange.Names"/>; 30 days by default),
    /// split into the chart's columns. Aggregated in memory: fine for a personal site's traffic; move
    /// the grouping into SQL if it grows to millions of events.
    /// </summary>
    public static async Task<Ok<AnalyticsSummary>> GetSummary(
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

    /// <summary>"vice → dark" from a theme change's detail, or null when it's missing a side.</summary>
    private static string? ThemeSwitch(string detail)
    {
        var values = JsonSerializer.Deserialize<Dictionary<string, string>>(detail, Json);
        return values is not null && values.TryGetValue("from", out var from) && values.TryGetValue("to", out var to) ? $"{from} → {to}" : null;
    }

    private static string WithoutQuery(string path) => path.IndexOf('?') is var i and >= 0 ? path[..i] : path;

    /// <summary>The most common values, most first (ties alphabetically).</summary>
    private static List<NamedCount> Top(IEnumerable<string> values) =>
        [.. values
            .GroupBy(v => v)
            .Select(g => new NamedCount(g.Key, g.Count()))
            .OrderByDescending(c => c.Count)
            .ThenBy(c => c.Name, StringComparer.Ordinal)
            .Take(TopListSize)];

    /// <summary>Newest first. <paramref name="errorsOnly"/> keeps the visits that hit an error.</summary>
    public static async Task<Ok<PagedResponse<SessionSummary>>> ListSessions(
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

    /// <summary>The visit with every event in order: what's needed to reproduce what happened.</summary>
    public static async Task<Results<Ok<SessionDetails>, NotFound>> GetSession(
        Guid id,
        PortfolioDbContext db,
        CancellationToken cancellationToken)
    {
        var s = await db.VisitSessions.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id, cancellationToken);
        if (s is null) return TypedResults.NotFound();

        var events = await db.VisitEvents
            .AsNoTracking()
            .Where(e => e.SessionId == id)
            .OrderBy(e => e.Sequence)
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(new SessionDetails(
            s.Id, s.StartedAt, s.LastSeenAt, s.EntryPath, s.Referrer, s.UtmSource, s.UtmMedium, s.UtmCampaign,
            s.UserAgent, s.Device, s.Browser, s.OperatingSystem, s.Country, s.Language, s.TimeZone,
            s.ScreenWidth, s.ScreenHeight, s.ViewportWidth, s.ViewportHeight, s.Theme, s.LastTheme,
            [.. events.Select(e => new SessionEvent(
                e.Sequence,
                e.OccurredAt,
                e.Type,
                e.Path,
                e.Label,
                e.Detail is null ? null : JsonSerializer.Deserialize<Dictionary<string, string>>(e.Detail, Json)))]));
    }

    /// <summary>Deletes the visit and its events, e.g. your own test visits.</summary>
    public static async Task<Results<NoContent, NotFound>> DeleteSession(
        Guid id,
        PortfolioDbContext db,
        CancellationToken cancellationToken)
    {
        var session = await db.VisitSessions.FindAsync([id], cancellationToken);
        if (session is null) return TypedResults.NotFound();

        db.VisitSessions.Remove(session);
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }
}
