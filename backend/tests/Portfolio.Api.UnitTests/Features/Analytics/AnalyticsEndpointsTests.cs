using System.Net;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Analytics;

namespace Portfolio.Api.UnitTests.Features.Analytics;

public class AnalyticsEndpointsTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 12, 12, 0, 0, TimeSpan.Zero);
    private const string Chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
    private const string IPhone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

    private readonly FakeTimeProvider _time = new(Now);
    private readonly VisitorHasher _visitors;
    private readonly PortfolioDbContext _db = new(new DbContextOptionsBuilder<PortfolioDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    public AnalyticsEndpointsTests() => _visitors = new VisitorHasher(_time);

    private static readonly SessionInfo Info = new("/apps?utm_source=linkedin", "https://www.linkedin.com/feed/?x=1", "en-GB", "Europe/London", 1512, 982, 1400, 800, "vice");

    private static HttpContext Http(string userAgent = Chrome, string ip = "203.0.113.7", bool signedIn = false)
    {
        var http = new DefaultHttpContext();
        http.Request.Headers.UserAgent = userAgent;
        http.Request.Host = new HostString("jechel.dev");
        http.Connection.RemoteIpAddress = IPAddress.Parse(ip);
        if (signedIn) http.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Email, "admin@example.com")], "Cookies"));
        return http;
    }

    private static EventInput Event(int seq, string type, string path = "/apps", string? label = null, long ageMs = 0, Dictionary<string, string>? detail = null) =>
        new(seq, type, path, label, detail, ageMs);

    private Task<Results<NoContent, ValidationProblem>> Collect(Guid id, HttpContext? http = null, params EventInput[] events) =>
        AnalyticsEndpoints.Collect(new CollectRequest(id, Info, [.. events]), http ?? Http(), _db, _visitors, _time, CancellationToken.None);

    [Fact]
    public async Task Collect_records_the_visit_with_where_it_came_from_and_what_it_ran_on()
    {
        var id = Guid.NewGuid();

        var result = await Collect(id, null, Event(1, "pageview", "/apps?utm_source=linkedin", ageMs: 5000), Event(2, "click", label: "Check it on App Store", ageMs: 1000));

        Assert.IsType<NoContent>(result.Result);
        var session = await _db.VisitSessions.SingleAsync();
        Assert.Equal(id, session.Id);
        Assert.Equal(Now.AddSeconds(-5), session.StartedAt);
        Assert.Equal(Now.AddSeconds(-1), session.LastSeenAt);
        Assert.Equal("/apps?utm_source=linkedin", session.EntryPath);
        Assert.Equal("www.linkedin.com/feed", session.Referrer);
        Assert.Equal("linkedin.com", session.ReferrerHost);
        Assert.Equal("linkedin", session.UtmSource);
        Assert.Equal(("desktop", "Chrome", "macOS"), (session.Device, session.Browser, session.OperatingSystem));
        Assert.Equal(("en-GB", "Europe/London", "vice"), (session.Language, session.TimeZone, session.Theme));
        Assert.Equal((1512, 982, 1400, 800), (session.ScreenWidth, session.ScreenHeight, session.ViewportWidth, session.ViewportHeight));
        Assert.Equal((1, 1, 2, 0), (session.PageViews, session.InteractionCount, session.EventCount, session.ErrorCount));
        Assert.Equal(64, session.VisitorHash.Length);
    }

    [Fact]
    public async Task Collect_adds_later_batches_to_the_same_visit_and_ignores_events_sent_twice()
    {
        var id = Guid.NewGuid();
        await Collect(id, null, Event(1, "pageview"), Event(2, "click", label: "About Me"));

        _time.Advance(TimeSpan.FromSeconds(30));
        await Collect(id, null, Event(2, "click", label: "About Me"), Event(3, "pageview", "/about"), Event(4, "error", "/about", "TypeError: boom"));

        var session = await _db.VisitSessions.SingleAsync();
        Assert.Equal((2, 4, 1), (session.PageViews, session.EventCount, session.ErrorCount));
        Assert.Equal(Now.AddSeconds(30), session.LastSeenAt);
        Assert.Equal([1, 2, 3, 4], await _db.VisitEvents.OrderBy(e => e.Sequence).Select(e => e.Sequence).ToListAsync());
    }

    [Fact]
    public async Task Collect_drops_unknown_event_types_and_cuts_long_text()
    {
        var id = Guid.NewGuid();

        await Collect(id, null, Event(1, "keystrokes"), Event(2, "error", label: new string('x', 1000), detail: new() { ["stack"] = "at App.tsx:12" }));

        var stored = await _db.VisitEvents.SingleAsync();
        Assert.Equal("error", stored.Type);
        Assert.Equal(AnalyticsRules.LabelMaxLength, stored.Label!.Length);
        Assert.Equal("""{"stack":"at App.tsx:12"}""", stored.Detail);
    }

    [Fact]
    public async Task Collect_ignores_the_signed_in_admin_and_bots()
    {
        await Collect(Guid.NewGuid(), Http(signedIn: true), Event(1, "pageview"));
        await Collect(Guid.NewGuid(), Http(userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1)"), Event(1, "pageview"));

        Assert.Empty(await _db.VisitSessions.ToListAsync());
    }

    [Fact]
    public async Task Collect_rejects_a_missing_session_id()
    {
        var result = await Collect(Guid.Empty, null, Event(1, "pageview"));

        Assert.IsType<ValidationProblem>(result.Result);
    }

    [Fact]
    public async Task Collect_dates_events_with_a_broken_age_now()
    {
        await Collect(Guid.NewGuid(), null, Event(1, "pageview", ageMs: (long)TimeSpan.FromDays(400).TotalMilliseconds), Event(2, "click", ageMs: -5000));

        Assert.All(await _db.VisitEvents.ToListAsync(), e => Assert.Equal(Now, e.OccurredAt));
    }

    [Fact]
    public async Task Collect_stops_recording_a_visit_at_its_limit()
    {
        var id = Guid.NewGuid();
        await Collect(id, null, Event(1, "pageview"));
        var session = await _db.VisitSessions.SingleAsync();
        session.EventCount = AnalyticsRules.MaxEventsPerSession;
        await _db.SaveChangesAsync();

        await Collect(id, null, Event(2, "click", label: "Apps"));

        Assert.Single(await _db.VisitEvents.ToListAsync());
    }

    [Fact]
    public async Task GetSummary_counts_visitors_visits_pages_bounces_and_errors_per_day()
    {
        // Yesterday: one visitor, two visits (one a bounce). Today: an iPhone visit with an error.
        await Collect(Guid.NewGuid(), null, Event(1, "pageview", "/"), Event(2, "click", "/", "Apps"), Event(3, "pageview", "/apps?page=2"));
        await Collect(Guid.NewGuid(), null, Event(1, "pageview", "/"));
        _time.Advance(TimeSpan.FromDays(1));
        await Collect(Guid.NewGuid(), Http(IPhone, "198.51.100.1"), Event(1, "pageview", "/apps"), Event(2, "error", "/apps", "TypeError: boom"));

        var summary = (await AnalyticsEndpoints.GetSummary(_db, _time, CancellationToken.None, range: "7d")).Value!;

        Assert.Equal(("7d", "day", new DateTimeOffset(2026, 10, 7, 0, 0, 0, TimeSpan.Zero)), (summary.Range, summary.BucketSize, summary.From));
        Assert.Equal(new AnalyticsTotals(Visitors: 2, Sessions: 3, PageViews: 4, AverageSessionSeconds: 0, BounceRate: 2 / 3.0, Errors: 1), summary.Totals);
        Assert.Equal(7, summary.Series.Count);
        Assert.Equal(new SeriesPoint(new DateTimeOffset(2026, 10, 12, 0, 0, 0, TimeSpan.Zero), 1, 2, 3, 0), summary.Series[^2]);
        Assert.Equal(new SeriesPoint(new DateTimeOffset(2026, 10, 13, 0, 0, 0, TimeSpan.Zero), 1, 1, 1, 1), summary.Series[^1]);
        Assert.Equal([new NamedCount("/", 2), new NamedCount("/apps", 2)], summary.TopPages);
        Assert.Equal([new NamedCount("linkedin.com", 3)], summary.Referrers);
        Assert.Equal([new NamedCount("desktop", 2), new NamedCount("mobile", 1)], summary.Devices);
        Assert.Equal([new NamedCount("Apps", 1)], summary.TopClicks);
        Assert.Equal([new NamedCount("TypeError: boom", 1)], summary.TopErrors);
    }

    [Fact]
    public async Task The_preferred_theme_is_the_one_a_visit_ends_in_and_switches_are_counted()
    {
        var switched = Guid.NewGuid();
        await Collect(switched, null, Event(1, "pageview"));
        var themeChanged = Event(2, "event", label: AnalyticsRules.ThemeChangedEvent, detail: new() { ["from"] = "vice", ["to"] = "dark" });
        await AnalyticsEndpoints.Collect(new CollectRequest(switched, Info with { CurrentTheme = "dark" }, [themeChanged]), Http(), _db, _visitors, _time, CancellationToken.None);
        await Collect(Guid.NewGuid(), null, Event(1, "pageview"));

        var session = await _db.VisitSessions.SingleAsync(s => s.Id == switched);
        Assert.Equal(("vice", "dark"), (session.Theme, session.LastTheme));

        var summary = (await AnalyticsEndpoints.GetSummary(_db, _time, CancellationToken.None, range: "7d")).Value!;
        Assert.Equal([new NamedCount("dark", 1), new NamedCount("vice", 1)], summary.Themes);
        Assert.Equal([new NamedCount("vice → dark", 1)], summary.ThemeSwitches);
    }

    [Fact]
    public async Task GetSummary_leaves_out_visits_before_the_range()
    {
        await Collect(Guid.NewGuid(), null, Event(1, "pageview"));
        _time.Advance(TimeSpan.FromDays(10));

        var summary = (await AnalyticsEndpoints.GetSummary(_db, _time, CancellationToken.None, range: "7d")).Value!;

        Assert.Equal(0, summary.Totals.Sessions);
        Assert.Empty(summary.TopPages);
        Assert.All(summary.Series, d => Assert.Equal(0, d.Sessions));
    }

    [Fact]
    public async Task GetSummary_for_the_last_hour_counts_page_views_in_the_5_minutes_they_happened()
    {
        var id = Guid.NewGuid();
        await Collect(id, null, Event(1, "pageview", "/", ageMs: 30 * 60_000), Event(2, "pageview", "/apps"));

        var summary = (await AnalyticsEndpoints.GetSummary(_db, _time, CancellationToken.None, range: "1h")).Value!;

        Assert.Equal(("1h", "5m", 12), (summary.Range, summary.BucketSize, summary.Series.Count));
        Assert.Equal(Now, summary.Series[^1].Start);
        Assert.Equal(1, summary.Series[^1].PageViews);
        Assert.Equal((1, 1), (summary.Series.Single(p => p.Start == Now.AddMinutes(-30)).PageViews, summary.Series.Single(p => p.Start == Now.AddMinutes(-30)).Sessions));
        Assert.Equal((1, 2), (summary.Totals.Sessions, summary.Totals.PageViews));
    }

    [Fact]
    public async Task GetSummary_for_all_time_starts_at_the_first_visits_month()
    {
        await Collect(Guid.NewGuid(), null, Event(1, "pageview"));
        _time.Advance(TimeSpan.FromDays(70));
        await Collect(Guid.NewGuid(), null, Event(1, "pageview"));

        var summary = (await AnalyticsEndpoints.GetSummary(_db, _time, CancellationToken.None, range: "all")).Value!;

        Assert.Equal(("all", "month"), (summary.Range, summary.BucketSize));
        Assert.Equal(new DateTimeOffset(2026, 10, 1, 0, 0, 0, TimeSpan.Zero), summary.From);
        Assert.Equal([1, 0, 1], summary.Series.Select(p => p.Sessions));
        Assert.Equal(2, summary.Totals.Visitors);
    }

    [Fact]
    public async Task ListSessions_shows_newest_first_and_can_keep_only_visits_with_errors()
    {
        var older = Guid.NewGuid();
        var newer = Guid.NewGuid();
        await Collect(older, null, Event(1, "pageview"), Event(2, "error", label: "boom"));
        _time.Advance(TimeSpan.FromMinutes(5));
        await Collect(newer, null, Event(1, "pageview"));

        var all = (await AnalyticsEndpoints.ListSessions(_db, CancellationToken.None)).Value!;
        var errors = (await AnalyticsEndpoints.ListSessions(_db, CancellationToken.None, errorsOnly: true)).Value!;

        Assert.Equal([newer, older], all.Items.Select(s => s.Id));
        Assert.Equal([older], errors.Items.Select(s => s.Id));
        Assert.Equal(1, errors.TotalCount);
    }

    [Fact]
    public async Task GetSession_returns_every_event_in_order_with_its_detail()
    {
        var id = Guid.NewGuid();
        await Collect(id, null, Event(2, "click", label: "Apps"), Event(1, "pageview", "/"), Event(3, "error", label: "boom", detail: new() { ["stack"] = "at x" }));

        var details = Assert.IsType<Ok<SessionDetails>>((await AnalyticsEndpoints.GetSession(id, _db, CancellationToken.None)).Result).Value!;

        Assert.Equal([1, 2, 3], details.Events.Select(e => e.Seq));
        Assert.Equal("at x", details.Events[2].Detail!["stack"]);
        Assert.Null(details.Events[0].Detail);
        Assert.IsType<NotFound>((await AnalyticsEndpoints.GetSession(Guid.NewGuid(), _db, CancellationToken.None)).Result);
    }

    [Fact]
    public async Task DeleteSession_removes_the_visit()
    {
        var id = Guid.NewGuid();
        await Collect(id, null, Event(1, "pageview"));

        Assert.IsType<NoContent>((await AnalyticsEndpoints.DeleteSession(id, _db, CancellationToken.None)).Result);
        Assert.Empty(await _db.VisitSessions.ToListAsync());
        Assert.IsType<NotFound>((await AnalyticsEndpoints.DeleteSession(id, _db, CancellationToken.None)).Result);
    }
}
