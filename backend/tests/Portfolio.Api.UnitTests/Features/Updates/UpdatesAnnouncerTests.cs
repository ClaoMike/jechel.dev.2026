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
        Options.Create(new SiteOptions { PublicUrl = "https://jechel.dev" }),
        Options.Create(new YouTubeOptions { Channel = "@me", ApiKey = "key" }),
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

    private AppEntry App(string title, DateTimeOffset createdAt)
    {
        var app = new AppEntry { Title = title, Description = "A game.", Media = """[{"url":"/api/files/1/image.webp","kind":"image"}]""", CreatedAt = createdAt, UpdatedAt = createdAt };
        _db.Apps.Add(app);
        _db.SaveChanges();
        return app;
    }

    [Fact]
    public async Task The_first_run_only_marks_the_start_so_older_posts_are_not_sent()
    {
        Subscriber("ada@example.com");
        App("Old app", Start.AddDays(-10));
        _youTube.List.Add(new YouTubeVideo("old", "Old video", "", "https://i.ytimg.com/vi/old/hq.jpg", Start.AddDays(-1)));

        Assert.Equal(0, await Announcer().AnnounceNewAsync(CancellationToken.None));
        _time.Advance(TimeSpan.FromHours(1));
        Assert.Equal(0, await Announcer().AnnounceNewAsync(CancellationToken.None));
        Assert.Empty(_emails.Sent);
    }

    [Fact]
    public async Task A_new_app_goes_to_confirmed_subscribers_once_it_has_settled_and_only_once()
    {
        await Announcer().AnnounceNewAsync(CancellationToken.None);
        Subscriber("ada@example.com");
        Subscriber("bob@example.com", confirmed: false);
        _time.Advance(TimeSpan.FromMinutes(5));
        App("Space Game", _time.GetUtcNow());

        Assert.Equal(0, await Announcer().AnnounceNewAsync(CancellationToken.None));

        _time.Advance(UpdatesAnnouncer.AppGracePeriod);
        Assert.Equal(1, await Announcer().AnnounceNewAsync(CancellationToken.None));
        Assert.Equal(0, await Announcer().AnnounceNewAsync(CancellationToken.None));

        var email = Assert.Single(_emails.Sent);
        Assert.Equal("ada@example.com", email.To);
        Assert.Equal("A new app is out: Space Game", email.Subject);
        Assert.Contains("https://jechel.dev/api/files/1/image.webp", email.Html);
        Assert.Equal("https://jechel.dev/updates/unsubscribe?token=token-ada@example.com", email.UnsubscribeUrl);
        var announcement = await _db.Announcements.SingleAsync();
        Assert.Equal(("app", 1), (announcement.Kind, announcement.RecipientCount));
        Assert.Equal("Emailed: Space Game", Assert.Single(_alerts.Sent).Title);
    }

    [Fact]
    public async Task A_new_video_is_sent_at_once()
    {
        await Announcer().AnnounceNewAsync(CancellationToken.None);
        Subscriber("ada@example.com");
        _youTube.List.Add(new YouTubeVideo("new1", "Devlog 1", "Watch it.", "https://i.ytimg.com/vi/new1/hq.jpg", Start.AddMinutes(1)));
        _time.Advance(TimeSpan.FromMinutes(2));

        Assert.Equal(1, await Announcer().AnnounceNewAsync(CancellationToken.None));

        var email = Assert.Single(_emails.Sent);
        Assert.Equal("A new video is up: Devlog 1", email.Subject);
        Assert.Contains("https://www.youtube.com/watch?v=new1", email.Text);
    }

    [Fact]
    public async Task A_failed_email_is_not_counted_and_the_item_is_not_sent_again()
    {
        await Announcer().AnnounceNewAsync(CancellationToken.None);
        Subscriber("ada@example.com");
        _youTube.List.Add(new YouTubeVideo("new1", "Devlog 1", "", "https://i.ytimg.com/vi/new1/hq.jpg", Start.AddMinutes(1)));
        _emails.Fail = true;

        await Announcer().AnnounceNewAsync(CancellationToken.None);
        _emails.Fail = false;
        await Announcer().AnnounceNewAsync(CancellationToken.None);

        Assert.Equal(0, (await _db.Announcements.SingleAsync()).RecipientCount);
        Assert.Empty(_emails.Sent);
    }
}
