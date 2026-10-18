using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Updates;
using Portfolio.Api.Features.YouTube;
using Portfolio.Api.UnitTests.Features.Alerts;

namespace Portfolio.Api.UnitTests.Features.Updates;

public class UpdatesAnnouncerTests
{
    private static readonly DateTimeOffset Start = new(2026, 10, 18, 12, 0, 0, TimeSpan.Zero);

    private readonly FakeTimeProvider _time = new(Start);
    private readonly FakeEmailSender _emails = new();
    private readonly FakePhoneAlerts _alerts = new();
    private readonly Videos _youTube = new();
    private readonly SiteOptions _site = new() { PublicUrl = "https://jechel.dev" };
    private readonly PortfolioDbContext _db = new(new DbContextOptionsBuilder<PortfolioDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    public UpdatesAnnouncerTests() => UpdatesAnnouncer.DelayBetweenEmails = TimeSpan.Zero;

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
        _youTube,
        // Fetched afresh on every run.
        new RefreshingCache<IReadOnlyList<YouTubeVideo>>(_time, TimeSpan.Zero, TimeSpan.Zero),
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

        Assert.Equal(0, await Announcer().AnnounceNewAsync(default));
        _time.Advance(TimeSpan.FromHours(1));
        Assert.Equal(0, await Announcer().AnnounceNewAsync(default));
        Assert.Empty(_emails.Sent);
    }

    [Fact]
    public async Task A_new_app_waits_for_the_admin_then_goes_to_confirmed_subscribers_once()
    {
        await Announcer().AnnounceNewAsync(default);
        Subscriber("ada@example.com");
        Subscriber("bob@example.com", confirmed: false);
        await AppAsync("Space Game");

        Assert.Equal(0, await Announcer().AnnounceNewAsync(default));
        await Decide(AnnouncementStatus.Approved);
        Assert.Equal(1, await Announcer().AnnounceNewAsync(default));
        Assert.Equal(0, await Announcer().AnnounceNewAsync(default));

        var email = Assert.Single(_emails.Sent);
        Assert.Equal("ada@example.com", email.To);
        Assert.Equal("A new app is out: Space Game", email.Subject);
        Assert.Contains("https://jechel.dev/api/files/1/image.webp", email.Html);
        var announcement = await _db.Announcements.SingleAsync();
        Assert.Equal((AnnouncementStatus.Sent, 1), (announcement.Status, announcement.RecipientCount));
        Assert.Equal("Emailed: Space Game", _alerts.Sent.Last().Title);
    }

    [Fact]
    public async Task An_ignored_app_is_never_sent_and_a_decision_is_final()
    {
        await Announcer().AnnounceNewAsync(default);
        Subscriber("ada@example.com");
        await AppAsync("Space Game");

        await Decide(AnnouncementStatus.Ignored);
        await Decide(AnnouncementStatus.Approved);
        await Announcer().AnnounceNewAsync(default);

        Assert.Equal(AnnouncementStatus.Ignored, (await _db.Announcements.SingleAsync()).Status);
        Assert.Empty(_emails.Sent);
    }

    [Fact]
    public async Task An_approved_app_deleted_since_is_skipped()
    {
        await Announcer().AnnounceNewAsync(default);
        Subscriber("ada@example.com");
        var app = await AppAsync("Space Game");
        await Decide(AnnouncementStatus.Approved);
        _db.Apps.Remove(app);
        await _db.SaveChangesAsync();

        Assert.Equal(0, await Announcer().AnnounceNewAsync(default));
        Assert.Equal(AnnouncementStatus.Ignored, (await _db.Announcements.SingleAsync()).Status);
    }

    [Fact]
    public async Task A_new_video_is_sent_without_asking()
    {
        await Announcer().AnnounceNewAsync(default);
        Subscriber("ada@example.com");
        _youTube.List.Add(new YouTubeVideo("new1", "Devlog 1", "Watch it.", "https://i.ytimg.com/vi/new1/hq.jpg", Start.AddMinutes(1)));
        _time.Advance(TimeSpan.FromMinutes(2));

        Assert.Equal(1, await Announcer().AnnounceNewAsync(default));

        var email = Assert.Single(_emails.Sent);
        Assert.Equal("A new video is up: Devlog 1", email.Subject);
        Assert.Contains("https://www.youtube.com/watch?v=new1", email.Text);
    }

    [Fact]
    public async Task A_failed_email_is_not_counted_and_the_item_is_not_sent_again()
    {
        await Announcer().AnnounceNewAsync(default);
        Subscriber("ada@example.com");
        _youTube.List.Add(new YouTubeVideo("new1", "Devlog 1", "", "https://i.ytimg.com/vi/new1/hq.jpg", Start.AddMinutes(1)));
        _emails.Fail = true;

        await Announcer().AnnounceNewAsync(default);
        _emails.Fail = false;
        await Announcer().AnnounceNewAsync(default);

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
}
