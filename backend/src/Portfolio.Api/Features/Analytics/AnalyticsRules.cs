using System.Text.RegularExpressions;

namespace Portfolio.Api.Features.Analytics;

/// <summary>
/// What the tracker may record, and how it's tidied up. Recording is lenient: a visitor's browser
/// can't fix a bad event, so anything too long is cut and anything unknown is dropped, not rejected.
/// </summary>
public static partial class AnalyticsRules
{
    /// <summary>
    /// pageview: a page opened. click: a button, link or field clicked (its label, never what was typed),
    /// or embedded content such as the YouTube player. key: Escape pressed. change: a field changed (a
    /// choice's option; for a text field only that it was edited). submit: a form sent (with Enter or a
    /// button). event: something the site reports, e.g. "Message sent". scroll: how far down a page was
    /// read ("75%"). tab: the tab hidden or back. error: a script error, a crash, a failed request or a
    /// file that didn't load. leave: the tab was closed or the visitor went to another site.
    /// </summary>
    public static readonly IReadOnlySet<string> EventTypes = new HashSet<string> { "pageview", "click", "key", "change", "submit", "event", "scroll", "tab", "error", "leave" };

    /// <summary>What the visitor did on purpose: a visit with any of these isn't a bounce.</summary>
    public static readonly IReadOnlySet<string> InteractionTypes = new HashSet<string> { "click", "key", "change", "submit", "event" };

    /// <summary>The site event the tracker sends when the visitor picks another theme, with "from" and "to".</summary>
    public const string ThemeChangedEvent = "Theme changed";

    public const int ThemeMaxLength = 20;

    public const int MaxEventsPerBatch = 50;

    /// <summary>A visit stops recording here, so a stuck loop can't fill the database.</summary>
    public const int MaxEventsPerSession = 2000;

    public const int PathMaxLength = 300;
    public const int LabelMaxLength = 200;
    public const int ShortTextMaxLength = 100;
    public const int UserAgentMaxLength = 500;
    public const int MaxDetailEntries = 10;
    public const int DetailKeyMaxLength = 40;

    /// <summary>Long enough for an error's stack or React's component stack.</summary>
    public const int DetailValueMaxLength = 4000;

    /// <summary>An event older than this when it arrives is dated now: the browser's clock or counter went wrong.</summary>
    public static readonly TimeSpan MaxEventAge = TimeSpan.FromDays(1);

    public static string? Cut(string? value, int maxLength)
    {
        if (value is null) return null;
        var trimmed = value.Trim();
        if (trimmed.Length == 0) return null;
        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }

    /// <summary>A site path ("/apps?page=2"); anything else becomes "/".</summary>
    public static string NormalizePath(string? path)
    {
        var cut = Cut(path, PathMaxLength);
        return cut is not null && cut.StartsWith('/') ? cut : "/";
    }

    /// <summary>At most <see cref="MaxDetailEntries"/> entries, keys and values cut; null when empty.</summary>
    public static Dictionary<string, string>? NormalizeDetail(Dictionary<string, string>? detail)
    {
        if (detail is null) return null;
        var result = new Dictionary<string, string>();
        foreach (var (key, value) in detail)
        {
            if (result.Count == MaxDetailEntries) break;
            var k = Cut(key, DetailKeyMaxLength);
            var v = Cut(value, DetailValueMaxLength);
            if (k is not null && v is not null) result[k] = v;
        }
        return result.Count == 0 ? null : result;
    }

    /// <summary>
    /// The referring page as host and path (queries can hold tokens), or null when there's none, it
    /// isn't a web address, or it's this site.
    /// </summary>
    public static (string? Referrer, string? Host) NormalizeReferrer(string? referrer, string siteHost)
    {
        if (!Uri.TryCreate(referrer, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            return (null, null);

        static string WithoutWww(string host) => host.StartsWith("www.", StringComparison.OrdinalIgnoreCase) ? host[4..] : host;
        var host = WithoutWww(uri.Host);
        if (string.Equals(host, WithoutWww(siteHost), StringComparison.OrdinalIgnoreCase)) return (null, null);
        return (Cut(uri.Host + uri.AbsolutePath.TrimEnd('/'), PathMaxLength), Cut(host.ToLowerInvariant(), ShortTextMaxLength));
    }

    /// <summary>utm_source / utm_medium / utm_campaign from the entry page's query, for links you share.</summary>
    public static (string? Source, string? Medium, string? Campaign) ReadUtm(string entryPath)
    {
        var query = entryPath.IndexOf('?') is var i and >= 0 ? entryPath[(i + 1)..] : "";
        var values = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(query);
        string? Read(string key) => values.TryGetValue(key, out var value) ? Cut(value.ToString(), ShortTextMaxLength) : null;
        return (Read("utm_source"), Read("utm_medium"), Read("utm_campaign"));
    }

    /// <summary>A two-letter country code from Cloudflare's CF-IPCountry header ("XX" and "T1", unknown and Tor, are dropped).</summary>
    public static string? NormalizeCountry(string? header) =>
        header is { Length: 2 } && char.IsAsciiLetter(header[0]) && char.IsAsciiLetter(header[1]) && header is not ("XX" or "xx" or "T1")
            ? header.ToUpperInvariant()
            : null;

    public record UserAgentInfo(string Device, string Browser, string OperatingSystem, bool IsBot);

    /// <summary>A rough reading of the User-Agent: enough for the dashboard's charts, not a full parser.</summary>
    public static UserAgentInfo ParseUserAgent(string? userAgent)
    {
        var ua = userAgent ?? "";
        var isBot = ua.Length == 0 || BotPattern().IsMatch(ua);

        var device =
            ua.Contains("iPad") || (ua.Contains("Android") && !ua.Contains("Mobile")) ? "tablet"
            : ua.Contains("Mobi") || ua.Contains("iPhone") || ua.Contains("Android") ? "mobile"
            : "desktop";

        var browser =
            ua.Contains("Edg/") || ua.Contains("EdgiOS") || ua.Contains("EdgA") ? "Edge"
            : ua.Contains("OPR/") || ua.Contains("Opera") ? "Opera"
            : ua.Contains("SamsungBrowser") ? "Samsung Internet"
            : ua.Contains("Firefox/") || ua.Contains("FxiOS") ? "Firefox"
            : ua.Contains("CriOS") || ua.Contains("Chrome/") ? "Chrome"
            : ua.Contains("Safari/") ? "Safari"
            : "Other";

        var os =
            ua.Contains("Windows") ? "Windows"
            : ua.Contains("iPhone") || ua.Contains("iPad") || ua.Contains("iPod") ? "iOS"
            : ua.Contains("Android") ? "Android"
            : ua.Contains("CrOS") ? "ChromeOS"
            : ua.Contains("Mac OS X") || ua.Contains("Macintosh") ? "macOS"
            : ua.Contains("Linux") ? "Linux"
            : "Other";

        return new UserAgentInfo(device, browser, os, isBot);
    }

    /// <summary>Search engines, link previews, uptime checkers and headless browsers (which includes the E2E tests).</summary>
    [GeneratedRegex(@"bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|curl|wget|python-requests|facebookexternalhit|embedly", RegexOptions.IgnoreCase)]
    private static partial Regex BotPattern();
}
