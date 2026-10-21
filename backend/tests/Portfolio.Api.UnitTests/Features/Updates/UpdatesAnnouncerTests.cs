using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Updates;
using Portfolio.Api.Features.YouTube;
using Portfolio.Api.UnitTests.Features.Alerts;
using Portfolio.Api.UnitTests.Features.YouTube;

namespace Portfolio.Api.UnitTests.Features.Updates;

public class UpdatesAnnouncerTests
{
    private static readonly DateTimeOffset Start = new(2026, 10, 18, 12, 0, 0, TimeSpan.Zero);

    private readonly FakeTimeProvider _time = new(Start);
    private readonly FakeEmailSender _emails = new();
    private readonly FakePhoneAlerts _alerts = new();
    private readonly Videos _youTube = new();
    // Every page and feature on unless a test switches one off (Hide).
    private readonly SiteOptions _site = new() { PublicUrl = "https://jechel.dev", PagesVisibleByDefault = true };
    private readonly TestDatabase _database = new();
    private readonly PortfolioDbContext _db;
    private readonly YouTubeVideoStore _store;

    public UpdatesAnnouncerTests()
    {
        UpdatesAnnouncer.DelayBetweenEmails = TimeSpan.Zero;
        _db = _database.Open();
        _store = new YouTubeVideoStore(_database.Scopes, _youTube, TestOptions.Monitor(new YouTubeOptions { Channel = "@me", ApiKey = "key" }), _time, NullLogger<YouTubeVideoStore>.Instance);
    }

    /// <summary>Switches these pages or features off for visitors (Settings → Visitor pages).</summary>
    private async Task Hide(string[]? pages = null, string[]? features = null)
    {
        var request = new Portfolio.Api.Features.Site.SaveSiteRequest(
            pages?.ToDictionary(p => p, _ => false), features?.ToDictionary(f => f, _ => false), null, null);
        await Portfolio.Api.Features.Site.SiteEndpoints.SaveStatus(request, _db, TestSite.Services().Cache(), Options.Create(_site), _time, default);
    }

    private async Task Show(string[]? pages = null, string[]? features = null)
    {
        var request = new Portfolio.Api.Features.Site.SaveSiteRequest(
            pages?.ToDictionary(p => p, _ => true), features?.ToDictionary(f => f, _ => true), null, null);
        await Portfolio.Api.Features.Site.SiteEndpoints.SaveStatus(request, _db, TestSite.Services().Cache(), Options.Create(_site), _time, default);
    }

    /// <summary>A run of the announcer, with the channel's videos as they are now (as the hourly refresh keeps them).</summary>
    private async Task<int> AnnounceAsync()
    {
        await _store.RefreshAsync(default);
        return await Announcer().AnnounceNewAsync(default);
    }

    private sealed class Videos : IYouTubeClient
    {
        public List<YouTubeVideo> List { get; } = [];
        public Task<IReadOnlyList<YouTubeVideo>> FetchVideosAsync(CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<YouTubeVideo>>([.. List]);
    }

    private UpdatesAnnouncer Announcer() => new(
        _db,
        _emails,
        Options.Create(_site),
        TestOptions.Monitor(new YouTubeOptions { Channel = "@me", ApiKey = "key" }),
        _store,
        _alerts,
        _time,
        NullLogger<UpdatesAnnouncer>.Instance);

    private void Subscriber(string email, bool confirmed = true)
    {
        _db.Subscribers.Add(new Subscriber { Email = email, Token = $"token-{email}", CreatedAt = Start, ConfirmationSentAt = Start, ConfirmedAt = confirmed ? Start : null });
        _db.SaveChanges();
    }

    private async Task<AppEntry> AppAsync(string title)
    {
        var app = new AppEntry { Title = title, Description = "A game.", Media = """[{"url":"/api/files/1/image.webp","kind":"image"}]""", CreatedAt = _time.GetUtcNow(), UpdatedAt = _time.GetUtcNow() };
        _db.Apps.Add(app);
        await _db.SaveChangesAsync();
        await AnnouncementDecisions.ProposeAppAsync(app, _db, _alerts, _site, _time, default);
        return app;
    }

    private Task Decide(string status) =>
        UpdatesEndpoints.Decide(_db.Announcements.Single().Id, null, status, SignedIn(), _db, new UpdatesTrigger(), default);

    private static Microsoft.AspNetCore.Http.DefaultHttpContext SignedIn() => new()
    {
        User = new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity([new System.Security.Claims.Claim("email", "admin@example.com")], "Cookies")),
    };

    [Fact]
    public async Task The_first_run_only_marks_the_start_so_older_videos_are_not_sent()
    {
        Subscriber("ada@example.com");
        _youTube.List.Add(new YouTubeVideo("old", "Old video", "", "https://i.ytimg.com/vi/old/hq.jpg", Start.AddDays(-1)));

        Assert.Equal(0, await AnnounceAsync());
        _time.Advance(TimeSpan.FromHours(1));
        Assert.Equal(0, await AnnounceAsync());
        Assert.Empty(_emails.Sent);
    }

    [Fact]
    public async Task A_new_app_waits_for_the_admin_then_goes_to_confirmed_subscribers_once()
    {
        await AnnounceAsync();
        Subscriber("ada@example.com");
        Subscriber("bob@example.com", confirmed: false);
        await AppAsync("Space Game");

        Assert.Equal(0, await AnnounceAsync());
        await Decide(AnnouncementStatus.Approved);
        Assert.Equal(1, await AnnounceAsync());
        Assert.Equal(0, await AnnounceAsync());

        var email = Assert.Single(_emails.Sent);
        Assert.Equal("ada@example.com", email.To);
        Assert.Equal("A new app is out: Space Game", email.Subject);
        Assert.Contains("https://jechel.dev/api/files/1/image.webp", email.Html);
        Assert.Contains("https://jechel.dev/apps", email.Html);
        var announcement = await _db.Announcements.SingleAsync();
        Assert.Equal((AnnouncementStatus.Sent, 1), (announcement.Status, announcement.RecipientCount));
        Assert.Equal("Emailed: Space Game", _alerts.Sent.Last().Title);
    }

    [Fact]
    public async Task An_ignored_app_is_never_sent_and_a_decision_is_final()
    {
        await AnnounceAsync();
        Subscriber("ada@example.com");
        await AppAsync("Space Game");

        await Decide(AnnouncementStatus.Ignored);
        await Decide(AnnouncementStatus.Approved);
        await AnnounceAsync();

        Assert.Equal(AnnouncementStatus.Ignored, (await _db.Announcements.SingleAsync()).Status);
        Assert.Empty(_emails.Sent);
    }

    [Fact]
    public async Task An_approved_app_deleted_since_is_skipped()
    {
        await AnnounceAsync();
        Subscriber("ada@example.com");
        var app = await AppAsync("Space Game");
        await Decide(AnnouncementStatus.Approved);
        _db.Apps.Remove(app);
        await _db.SaveChangesAsync();

        Assert.Equal(0, await AnnounceAsync());
        Assert.Equal(AnnouncementStatus.Ignored, (await _db.Announcements.SingleAsync()).Status);
    }

    [Fact]
    public async Task A_new_video_is_sent_without_asking()
    {
        await AnnounceAsync();
        Subscriber("ada@example.com");
        _youTube.List.Add(new YouTubeVideo("new1", "Devlog 1", "Watch it.", "https://i.ytimg.com/vi/new1/hq.jpg", Start.AddMinutes(1)));
        _time.Advance(TimeSpan.FromMinutes(2));

        Assert.Equal(1, await AnnounceAsync());

        var email = Assert.Single(_emails.Sent);
        Assert.Equal("A new video is up: Devlog 1", email.Subject);
        Assert.Contains("https://www.youtube.com/watch?v=new1", email.Text);
    }

    [Fact]
    public async Task A_failed_email_is_not_counted_and_the_item_is_not_sent_again()
    {
        await AnnounceAsync();
        Subscriber("ada@example.com");
        _youTube.List.Add(new YouTubeVideo("new1", "Devlog 1", "", "https://i.ytimg.com/vi/new1/hq.jpg", Start.AddMinutes(1)));
        _emails.Fail = true;

        await AnnounceAsync();
        _emails.Fail = false;
        await AnnounceAsync();

        Assert.Equal(0, (await _db.Announcements.SingleAsync()).RecipientCount);
        Assert.Empty(_emails.Sent);
    }

    [Fact]
    public async Task Visitors_need_the_alert_token_to_decide()
    {
        await AppAsync("Space Game");
        var id = _db.Announcements.Single().Id;
        var token = _alerts.Sent.Single().Actions![0].Url.Split("token=")[1];

        var refused = await UpdatesEndpoints.Decide(id, "guess", AnnouncementStatus.Approved, new Microsoft.AspNetCore.Http.DefaultHttpContext(), _db, new UpdatesTrigger(), default);
        var allowed = await UpdatesEndpoints.Decide(id, token, AnnouncementStatus.Approved, new Microsoft.AspNetCore.Http.DefaultHttpContext(), _db, new UpdatesTrigger(), default);

        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.UnauthorizedHttpResult>(refused.Result);
        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.Ok<DecisionResult>>(allowed.Result);
        Assert.Equal(AnnouncementStatus.Approved, _db.Announcements.Single().Status);
        Assert.Null(_db.Announcements.Single().DecisionTokenHash);
    }

    [Fact]
    public async Task A_video_published_while_the_YouTube_page_is_hidden_is_never_emailed()
    {
        await AnnounceAsync();
        Subscriber("ada@example.com");
        await Hide(pages: ["youtube"]);
        _youTube.List.Add(new YouTubeVideo("hidden", "While hidden", "", "https://i.ytimg.com/vi/hidden/hq.jpg", Start.AddMinutes(1)));
        _time.Advance(TimeSpan.FromMinutes(2));

        Assert.Equal(0, await AnnounceAsync());
        await Show(pages: ["youtube"]);
        _time.Advance(TimeSpan.FromMinutes(10));

        // Seen while hidden: switching the page on doesn't email a backlog.
        Assert.Equal(0, await AnnounceAsync());
        Assert.Empty(_emails.Sent);
        Assert.Equal(AnnouncementStatus.Ignored, (await _db.Announcements.SingleAsync()).Status);
    }

    [Fact]
    public async Task Nothing_is_emailed_while_updates_are_switched_off_and_an_approved_app_waits()
    {
        await AnnounceAsync();
        Subscriber("ada@example.com");
        await AppAsync("Space Game");
        await Decide(AnnouncementStatus.Approved);
        await Hide(features: ["updates"]);
        _youTube.List.Add(new YouTubeVideo("off", "While off", "", "https://i.ytimg.com/vi/off/hq.jpg", Start.AddMinutes(1)));
        _time.Advance(TimeSpan.FromMinutes(2));

        Assert.Equal(0, await AnnounceAsync());
        Assert.Empty(_emails.Sent);

        await Show(features: ["updates"]);
        Assert.Equal(1, await AnnounceAsync());

        Assert.Equal("A new app is out: Space Game", Assert.Single(_emails.Sent).Subject);
        Assert.Equal(AnnouncementStatus.Ignored, (await _db.Announcements.SingleAsync(a => a.ItemKey == "off")).Status);
    }

    [Fact]
    public async Task An_approved_app_isnt_emailed_while_the_Apps_page_is_hidden()
    {
        await AnnounceAsync();
        Subscriber("ada@example.com");
        await AppAsync("Space Game");
        await Decide(AnnouncementStatus.Approved);
        await Hide(pages: ["apps"]);

        Assert.Equal(0, await AnnounceAsync());

        Assert.Empty(_emails.Sent);
        Assert.Equal(AnnouncementStatus.Ignored, (await _db.Announcements.SingleAsync()).Status);
    }

    [Theory]
    [InlineData("apps", null)]
    [InlineData(null, "updates")]
    public async Task A_new_app_isnt_offered_to_email_while_its_page_or_the_updates_are_hidden(string? page, string? feature)
    {
        await Hide(page is null ? null : [page], feature is null ? null : [feature]);

        await AppAsync("Space Game");

        Assert.Empty(_db.Announcements);
        Assert.Empty(_alerts.Sent);
    }

    [Fact]
    public async Task A_new_app_is_offered_to_email_with_how_many_would_get_it()
    {
        Subscriber("ada@example.com");

        await AppAsync("Space Game");

        var alert = Assert.Single(_alerts.Sent);
        Assert.Equal("New app: Space Game", alert.Title);
        Assert.StartsWith("Email it to your 1 subscriber?", alert.Message);
        Assert.Equal(["Send email", "Ignore"], alert.Actions!.Select(a => a.Label));
        Assert.Equal(AnnouncementStatus.Pending, (await _db.Announcements.SingleAsync()).Status);
    }
}
