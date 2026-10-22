using Portfolio.Api.Features.Analytics;

namespace Portfolio.Api.UnitTests.Features.Analytics;

public class AnalyticsRulesTests
{
    private const string MacChrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
    private const string IPhoneSafari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    private const string AndroidTabletChrome = "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
    private const string WindowsEdge = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0";
    private const string LinuxFirefox = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";

    [Theory]
    [InlineData(MacChrome, "desktop", "Chrome", "macOS")]
    [InlineData(IPhoneSafari, "mobile", "Safari", "iOS")]
    [InlineData(AndroidTabletChrome, "tablet", "Chrome", "Android")]
    [InlineData(WindowsEdge, "desktop", "Edge", "Windows")]
    [InlineData(LinuxFirefox, "desktop", "Firefox", "Linux")]
    public void ParseUserAgent_reads_device_browser_and_system(string userAgent, string device, string browser, string os)
    {
        var info = AnalyticsRules.ParseUserAgent(userAgent);

        Assert.Equal(new AnalyticsRules.UserAgentInfo(device, browser, os, IsBot: false), info);
    }

    [Theory]
    [InlineData("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")]
    [InlineData("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36")]
    [InlineData("curl/8.7.1")]
    [InlineData("")]
    [InlineData(null)]
    public void ParseUserAgent_spots_bots_and_headless_browsers(string? userAgent)
    {
        Assert.True(AnalyticsRules.ParseUserAgent(userAgent).IsBot);
    }

    [Theory]
    [InlineData("https://www.linkedin.com/feed/?trk=abc", "www.linkedin.com/feed", "linkedin.com")]
    [InlineData("https://news.ycombinator.com/", "news.ycombinator.com", "news.ycombinator.com")]
    [InlineData("https://jechel.dev/apps", null, null)]
    [InlineData("https://www.jechel.dev/apps", null, null)]
    [InlineData("android-app://com.slack/", null, null)]
    [InlineData("ftp://files.example.com/x", null, null)]
    [InlineData("not a link", null, null)]
    [InlineData("", null, null)]
    [InlineData(null, null, null)]
    public void NormalizeReferrer_keeps_other_sites_without_their_query(string? referrer, string? expected, string? expectedHost)
    {
        Assert.Equal((expected, expectedHost), AnalyticsRules.NormalizeReferrer(referrer, "jechel.dev"));
    }

    [Fact]
    public void ReadUtm_reads_the_campaign_from_the_entry_page()
    {
        Assert.Equal(("linkedin", "social", "cv"), AnalyticsRules.ReadUtm("/apps?utm_source=linkedin&utm_medium=social&utm_campaign=cv"));
        Assert.Equal((null, null, null), AnalyticsRules.ReadUtm("/apps?page=2"));
        Assert.Equal((null, null, null), AnalyticsRules.ReadUtm("/"));
    }

    [Theory]
    [InlineData("/apps?page=2", "/apps?page=2")]
    [InlineData("  /about ", "/about")]
    [InlineData("https://evil.example/", "/")]
    [InlineData("", "/")]
    [InlineData(null, "/")]
    public void NormalizePath_keeps_site_paths_only(string? path, string expected)
    {
        Assert.Equal(expected, AnalyticsRules.NormalizePath(path));
    }

    [Fact]
    public void NormalizePath_cuts_long_paths()
    {
        Assert.Equal(AnalyticsRules.PathMaxLength, AnalyticsRules.NormalizePath("/" + new string('a', 1000)).Length);
    }

    [Fact]
    public void NormalizeDetail_drops_empty_values_and_cuts_the_rest()
    {
        var detail = new Dictionary<string, string> { ["stack"] = new('s', 10_000), ["empty"] = "  ", ["href"] = "/apps" };

        var result = AnalyticsRules.NormalizeDetail(detail)!;

        Assert.Equal(["href", "stack"], result.Keys.Order());
        Assert.Equal(AnalyticsRules.DetailValueMaxLength, result["stack"].Length);
        Assert.Null(AnalyticsRules.NormalizeDetail([]));
        Assert.Null(AnalyticsRules.NormalizeDetail(null));
    }

    [Fact]
    public void NormalizeDetail_keeps_at_most_ten_entries()
    {
        var detail = Enumerable.Range(0, 20).ToDictionary(i => $"k{i}", i => "v");

        Assert.Equal(AnalyticsRules.MaxDetailEntries, AnalyticsRules.NormalizeDetail(detail)!.Count);
    }

    [Theory]
    [InlineData("gb", "GB")]
    [InlineData("RO", "RO")]
    [InlineData("XX", null)]
    [InlineData("T1", null)]
    [InlineData("", null)]
    [InlineData("GBR", null)]
    public void NormalizeCountry_reads_cloudflares_header(string header, string? expected)
    {
        Assert.Equal(expected, AnalyticsRules.NormalizeCountry(header));
    }

    [Fact]
    public void NormalizeDetail_drops_entries_with_a_blank_key()
    {
        var result = AnalyticsRules.NormalizeDetail(new Dictionary<string, string> { [" "] = "x", ["to"] = "dark" })!;

        Assert.Equal(["to"], result.Keys);
    }
}
