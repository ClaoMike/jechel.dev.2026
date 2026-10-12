namespace Portfolio.Api.Data;

/// <summary>
/// One visit: a browser tab from the first page it opened until it was closed. The id comes from the
/// browser (kept in sessionStorage), so a reload stays the same visit. The signed-in admin is never recorded.
/// </summary>
public class VisitSession
{
    public Guid Id { get; set; }

    /// <summary>
    /// Hash of the IP address and browser with a salt that changes every day (UTC) and is never stored,
    /// so the same person counts once a day but can't be followed from one day to the next.
    /// </summary>
    public required string VisitorHash { get; set; }

    public DateTimeOffset StartedAt { get; set; }

    /// <summary>When the last event happened, so the visit's length is <c>LastSeenAt - StartedAt</c>.</summary>
    public DateTimeOffset LastSeenAt { get; set; }

    /// <summary>The first page, with its query (e.g. "/apps?utm_source=linkedin").</summary>
    public required string EntryPath { get; set; }

    /// <summary>The site the visitor came from (host and path, no query), or null when typed in or from this site.</summary>
    public string? Referrer { get; set; }
    public string? ReferrerHost { get; set; }

    public string? UtmSource { get; set; }
    public string? UtmMedium { get; set; }
    public string? UtmCampaign { get; set; }

    public required string UserAgent { get; set; }

    /// <summary>"desktop", "mobile" or "tablet".</summary>
    public required string Device { get; set; }
    public required string Browser { get; set; }
    public required string OperatingSystem { get; set; }

    /// <summary>Two-letter country code from the CDN (Cloudflare's CF-IPCountry), when there is one.</summary>
    public string? Country { get; set; }
    public string? Language { get; set; }

    /// <summary>The browser's IANA time zone, e.g. "Europe/London": a rough "where", without looking up the IP.</summary>
    public string? TimeZone { get; set; }

    public int ScreenWidth { get; set; }
    public int ScreenHeight { get; set; }
    public int ViewportWidth { get; set; }
    public int ViewportHeight { get; set; }

    /// <summary>
    /// The site theme the visit started in ("vice", "dark", "light"): Vice for first-time visitors,
    /// the one they chose before for those coming back.
    /// </summary>
    public string? Theme { get; set; }

    /// <summary>The theme when the last batch came, which is sent as the tab closes: the visitor's preferred theme.</summary>
    public string? LastTheme { get; set; }

    public int PageViews { get; set; }

    /// <summary>Clicks, keys and site events: a visit with none and one page view is a bounce.</summary>
    public int InteractionCount { get; set; }

    public int EventCount { get; set; }
    public int ErrorCount { get; set; }

    public List<VisitEvent> Events { get; set; } = [];
}
