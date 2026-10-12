namespace Portfolio.Api.Features.Analytics;

// ---------- Recording (public) ----------

/// <summary>
/// A batch from the browser's tracker. <paramref name="Session"/> comes with every batch, so the visit
/// is recorded even if the first batch was lost; only the first one that arrives is used.
/// </summary>
public record CollectRequest(Guid SessionId, SessionInfo? Session, List<EventInput>? Events);

/// <summary>
/// Where and on what the visit started. Sizes are CSS pixels. <paramref name="Theme"/> is the one the
/// visit started in; <paramref name="CurrentTheme"/> the one on show as the batch is sent.
/// </summary>
public record SessionInfo(
    string? Path,
    string? Referrer,
    string? Language,
    string? TimeZone,
    int ScreenWidth,
    int ScreenHeight,
    int ViewportWidth,
    int ViewportHeight,
    string? Theme,
    string? CurrentTheme = null);

/// <param name="AgeMs">How long ago it happened when the batch was sent. The server's clock dates it, not the browser's.</param>
public record EventInput(int Seq, string? Type, string? Path, string? Label, Dictionary<string, string>? Detail, long AgeMs);

// ---------- The dashboard (admin) ----------

public record AnalyticsSummary(
    string Range,
    string BucketSize,
    DateTimeOffset From,
    AnalyticsTotals Totals,
    IReadOnlyList<SeriesPoint> Series,
    IReadOnlyList<NamedCount> TopPages,
    IReadOnlyList<NamedCount> Referrers,
    IReadOnlyList<NamedCount> Devices,
    IReadOnlyList<NamedCount> Browsers,
    IReadOnlyList<NamedCount> TimeZones,
    IReadOnlyList<NamedCount> TopClicks,
    IReadOnlyList<NamedCount> TopErrors,
    IReadOnlyList<NamedCount> Themes,
    IReadOnlyList<NamedCount> ThemeSwitches);

/// <param name="Visitors">Unique per day, added up: the same person on two days counts twice.</param>
/// <param name="BounceRate">Share of visits (0 to 1) that saw one page and did nothing else.</param>
public record AnalyticsTotals(int Visitors, int Sessions, int PageViews, double AverageSessionSeconds, double BounceRate, int Errors);

/// <summary>
/// One column of the chart, from <paramref name="Start"/> (UTC) for one <see cref="AnalyticsSummary.BucketSize"/>.
/// Visits count when they started; page views and errors when they happened.
/// </summary>
public record SeriesPoint(DateTimeOffset Start, int Visitors, int Sessions, int PageViews, int Errors);

public record NamedCount(string Name, int Count);

public record SessionSummary(
    Guid Id,
    DateTimeOffset StartedAt,
    int DurationSeconds,
    int PageViews,
    int EventCount,
    int ErrorCount,
    string EntryPath,
    string? ReferrerHost,
    string Device,
    string Browser,
    string OperatingSystem,
    string? TimeZone,
    string? Theme,
    string? LastTheme);

public record SessionDetails(
    Guid Id,
    DateTimeOffset StartedAt,
    DateTimeOffset LastSeenAt,
    string EntryPath,
    string? Referrer,
    string? UtmSource,
    string? UtmMedium,
    string? UtmCampaign,
    string UserAgent,
    string Device,
    string Browser,
    string OperatingSystem,
    string? Country,
    string? Language,
    string? TimeZone,
    int ScreenWidth,
    int ScreenHeight,
    int ViewportWidth,
    int ViewportHeight,
    string? Theme,
    string? LastTheme,
    IReadOnlyList<SessionEvent> Events);

public record SessionEvent(int Seq, DateTimeOffset OccurredAt, string Type, string Path, string? Label, Dictionary<string, string>? Detail);
