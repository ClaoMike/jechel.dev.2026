using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Analytics;

/// <summary>
/// Visitor analytics, recorded by the site itself (no third parties, no cookies): the browser's
/// tracker sends what a visit does, and the admin's Engagement tab reads it back.
/// </summary>
public static class AnalyticsShared
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 50;
    public const int TopListSize = 10;

    /// <summary>Batches per IP (Analytics:LimitPer10Minutes): the tracker drops a refused one, and nothing else notices.</summary>
    public const string RateLimitPolicy = "analytics";

    internal static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;

    internal static DateTimeOffset OccurredAt(EventInput input, DateTimeOffset now)
    {
        var age = TimeSpan.FromMilliseconds(Math.Max(0, input.AgeMs));
        return age > AnalyticsRules.MaxEventAge ? now : now - age;
    }

    /// <summary>Returns the errors it stored (label and page), to alert the phone about.</summary>
    internal static async Task<List<(string Label, string Path)>> StoreAsync(
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

    /// <summary>"vice → dark" from a theme change's detail, or null when it's missing a side.</summary>
    internal static string? ThemeSwitch(string detail)
    {
        var values = JsonSerializer.Deserialize<Dictionary<string, string>>(detail, Json);
        return values is not null && values.TryGetValue("from", out var from) && values.TryGetValue("to", out var to) ? $"{from} → {to}" : null;
    }

    internal static string WithoutQuery(string path) => path.IndexOf('?') is var i and >= 0 ? path[..i] : path;

    /// <summary>The most common values, most first (ties alphabetically).</summary>
    internal static List<NamedCount> Top(IEnumerable<string> values) =>
        [.. values
            .GroupBy(v => v)
            .Select(g => new NamedCount(g.Key, g.Count()))
            .OrderByDescending(c => c.Count)
            .ThenBy(c => c.Name, StringComparer.Ordinal)
            .Take(TopListSize)];
}
