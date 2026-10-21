using System.Net;
using System.Net.Http.Json;
using Portfolio.Api.Features.Analytics;

namespace Portfolio.Api.IntegrationTests.Features.Analytics;

/// <summary>
/// Shares the database with the other test classes, so each test uses its own visit ids and only
/// asserts on those (totals only grow).
/// </summary>
[Collection(ApiCollection.Name)]
public class AnalyticsEndpointTests(PortfolioApiFactory factory)
{
    private const string Chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

    private static readonly SessionInfo Info = new("/", "https://www.linkedin.com/feed/", "en-GB", "Europe/London", 1512, 982, 1400, 800, "vice");

    private HttpClient Visitor(string userAgent = Chrome)
    {
        var client = factory.CreateBrowserClient();
        client.DefaultRequestHeaders.UserAgent.ParseAdd(userAgent);
        return client;
    }

    private async Task<HttpClient> SignedInClientAsync()
    {
        var client = Visitor();
        var response = await client.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}");
        response.EnsureSuccessStatusCode();
        return client;
    }

    private static async Task SendAsync(HttpClient client, Guid id, params EventInput[] events)
    {
        var response = await client.PostAsJsonAsync("/api/analytics/events", new CollectRequest(id, Info, [.. events]));
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    private static EventInput Event(int seq, string type, string path = "/", string? label = null, Dictionary<string, string>? detail = null) =>
        new(seq, type, path, label, detail, 0);

    [Fact]
    public async Task A_visit_is_recorded_and_the_admin_can_replay_it()
    {
        var id = Guid.NewGuid();
        var visitor = Visitor();
        await SendAsync(visitor, id, Event(1, "pageview", "/"), Event(2, "click", "/", "Apps", new() { ["element"] = "a", ["href"] = "/apps" }));
        await SendAsync(visitor, id, Event(2, "click", "/", "Apps"), Event(3, "pageview", "/apps"), Event(4, "error", "/apps", "TypeError: boom", new() { ["stack"] = "at AppsPage.tsx:10" }));

        var admin = await SignedInClientAsync();
        var details = await admin.GetFromJsonAsync<SessionDetails>($"/api/analytics/sessions/{id}");

        Assert.Equal(["pageview", "click", "pageview", "error"], details!.Events.Select(e => e.Type));
        Assert.Equal("/apps", details.Events[1].Detail!["href"]);
        Assert.Equal("at AppsPage.tsx:10", details.Events[3].Detail!["stack"]);
        Assert.Equal(("Chrome", "macOS", "www.linkedin.com/feed"), (details.Browser, details.OperatingSystem, details.Referrer));

        var errors = await admin.GetFromJsonAsync<PagedResponse<SessionSummary>>($"/api/analytics/sessions?errorsOnly=true&pageSize={AnalyticsEndpoints.MaxPageSize}");
        var summary = errors!.Items.Single(s => s.Id == id);
        Assert.Equal((2, 4, 1, "/"), (summary.PageViews, summary.EventCount, summary.ErrorCount, summary.EntryPath));
    }

    [Fact]
    public async Task Everything_a_visitor_does_is_replayed_and_summed_up()
    {
        var id = Guid.NewGuid();
        var visitor = Visitor();
        visitor.DefaultRequestHeaders.Add("CF-IPCountry", "NZ");
        // First among the rarely seen ones (ties go alphabetically), whatever other tests recorded.
        var marker = $"Aaa booked {id:N}";
        await SendAsync(visitor, id,
            Event(1, "pageview", "/contact"),
            Event(2, "change", "/contact", "Message", new() { ["element"] = "textarea" }),
            Event(3, "submit", "/contact", "Contact", new() { ["via"] = "button" }),
            Event(4, "event", "/contact", marker),
            Event(5, "scroll", "/contact", "100%"),
            Event(6, "tab", "/contact", "Hidden"),
            Event(7, "leave", "/contact"));

        var admin = await SignedInClientAsync();
        var details = await admin.GetFromJsonAsync<SessionDetails>($"/api/analytics/sessions/{id}");
        Assert.Equal(["pageview", "change", "submit", "event", "scroll", "tab", "leave"], details!.Events.Select(e => e.Type));
        Assert.Equal("NZ", details.Country);
        Assert.Equal("button", details.Events[2].Detail!["via"]);

        var summary = await admin.GetFromJsonAsync<AnalyticsSummary>("/api/analytics/summary?range=1h");
        Assert.Contains(new NamedCount(marker, 1), summary!.SiteEvents);
        Assert.Contains(summary.Countries, c => c.Name == "NZ");
    }

    [Fact]
    public async Task The_summary_counts_todays_visits()
    {
        var admin = await SignedInClientAsync();
        var before = await admin.GetFromJsonAsync<AnalyticsSummary>("/api/analytics/summary?range=7d");

        await SendAsync(Visitor(), Guid.NewGuid(), Event(1, "pageview", "/youtube"));

        var after = await admin.GetFromJsonAsync<AnalyticsSummary>("/api/analytics/summary?range=7d");
        Assert.Equal(7, after!.Series.Count);
        Assert.Equal(before!.Totals.Sessions + 1, after.Totals.Sessions);
        Assert.Equal(before.Series[^1].PageViews + 1, after.Series[^1].PageViews);
        Assert.Contains(after.TopPages, p => p.Name == "/youtube");
    }

    [Fact]
    public async Task The_theme_a_visit_ends_in_is_kept()
    {
        var id = Guid.NewGuid();
        var visitor = Visitor();
        await SendAsync(visitor, id, Event(1, "pageview"));
        var response = await visitor.PostAsJsonAsync("/api/analytics/events", new CollectRequest(id, Info with { CurrentTheme = "light" },
            [Event(2, "event", "/", AnalyticsRules.ThemeChangedEvent, new() { ["from"] = "vice", ["to"] = "light" })]));
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        var admin = await SignedInClientAsync();
        var details = await admin.GetFromJsonAsync<SessionDetails>($"/api/analytics/sessions/{id}");
        Assert.Equal(("vice", "light"), (details!.Theme, details.LastTheme));
        var summary = await admin.GetFromJsonAsync<AnalyticsSummary>("/api/analytics/summary?range=24h");
        Assert.Contains(summary!.ThemeSwitches, s => s.Name == "vice → light");
    }

    [Fact]
    public async Task The_signed_in_admin_and_bots_are_not_recorded()
    {
        var adminVisit = Guid.NewGuid();
        var botVisit = Guid.NewGuid();
        var admin = await SignedInClientAsync();

        await SendAsync(admin, adminVisit, Event(1, "pageview"));
        await SendAsync(Visitor("Mozilla/5.0 (compatible; Googlebot/2.1)"), botVisit, Event(1, "pageview"));

        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/analytics/sessions/{adminVisit}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/analytics/sessions/{botVisit}")).StatusCode);
    }

    [Fact]
    public async Task Deleting_a_visit_deletes_its_events()
    {
        var id = Guid.NewGuid();
        await SendAsync(Visitor(), id, Event(1, "pageview"), Event(2, "click", label: "Apps"));
        var admin = await SignedInClientAsync();

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/analytics/sessions/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/analytics/sessions/{id}")).StatusCode);

        // Events went with it: the same ids can be recorded again as a new visit.
        await SendAsync(Visitor(), id, Event(1, "pageview"));
        Assert.Single((await admin.GetFromJsonAsync<SessionDetails>($"/api/analytics/sessions/{id}"))!.Events);
    }

    [Fact]
    public async Task A_batch_without_a_visit_id_is_rejected()
    {
        var response = await Visitor().PostAsJsonAsync("/api/analytics/events", new { events = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("GET", "/api/analytics/summary")]
    [InlineData("GET", "/api/analytics/sessions")]
    [InlineData("GET", "/api/analytics/sessions/00000000-0000-0000-0000-000000000001")]
    [InlineData("DELETE", "/api/analytics/sessions/00000000-0000-0000-0000-000000000001")]
    public async Task Reading_the_data_is_admin_only(string method, string url)
    {
        var response = await Visitor().SendAsync(new HttpRequestMessage(new HttpMethod(method), url));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
