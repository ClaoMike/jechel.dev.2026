using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Updates;
using Portfolio.Api.Features.YouTube;
using Portfolio.Api.UnitTests.Features.YouTube;
using static Portfolio.Api.UnitTests.Features.YouTube.FakeYouTubeClient;

namespace Portfolio.Api.UnitTests.Features.Updates;

/// <summary>Email updates about new YouTube videos (UpdatesAnnouncer's video side): they go out by themselves.</summary>
public class VideoUpdatesTests
{
    private static readonly DateTimeOffset Start = new(2026, 10, 1, 12, 0, 0, TimeSpan.Zero);

    private readonly TestDatabase _db = new();
    private readonly FakeYouTubeClient _youTube = new() { Videos = [Video("old", 0)] };
    private readonly FakeTimeProvider _time = new(Start);
    private readonly YouTubeOptions _options = new() { Channel = "@me", ApiKey = "key" };
    private readonly SentEmails _emails = new();
    private readonly SentAlerts _alerts = new();
    private readonly YouTubeVideoStore _store;

    public VideoUpdatesTests()
    {
        UpdatesAnnouncer.DelayBetweenEmails = TimeSpan.Zero;
        _store = new YouTubeVideoStore(_db.Scopes, _youTube, TestOptions.Monitor(_options), _time, NullLogger<YouTubeVideoStore>.Instance);
        using var db = _db.Open();
        db.Subscribers.AddRange(
            new Subscriber { Email = "ana@example.com", Token = "t-ana", ConfirmedAt = Start },
            new Subscriber { Email = "bob@example.com", Token = "t-bob", ConfirmedAt = Start },
            new Subscriber { Email = "unconfirmed@example.com", Token = "t-new" });
        db.SaveChanges();
    }

    private async Task<int> AnnounceAsync()
    {
        using var db = _db.Open();
        var announcer = new UpdatesAnnouncer(db, _emails, Options.Create(new SiteOptions { PublicUrl = "https://jechel.dev", PagesVisibleByDefault = true }), TestOptions.Monitor(_options), _store, _alerts, _time, NullLogger<UpdatesAnnouncer>.Instance);
        return await announcer.AnnounceNewAsync(CancellationToken.None);
    }

    /// <summary>Uploads a video published now, and lets the store see it (as the hourly refresh would).</summary>
    private async Task UploadAsync(params YouTubeVideo[] videos)
    {
        _youTube.Videos = [.. videos, .. _youTube.Videos];
        await _store.RefreshAsync(CancellationToken.None);
    }

    private static YouTubeVideo PublishedAt(string id, DateTimeOffset at, string? title = null, string? description = null) =>
        new(id, title ?? $"Video {id}", description ?? $"About {id}", $"https://i.ytimg.com/vi/{id}/hqdefault.jpg", at);

    private List<Announcement> Announcements()
    {
        using var db = _db.Open();
        return [.. db.Announcements.AsNoTracking().OrderBy(a => a.Id)];
    }

    [Fact]
    public async Task The_first_run_only_marks_the_start_so_videos_already_up_arent_news()
    {
        Assert.Equal(0, await AnnounceAsync());
        _time.Advance(TimeSpan.FromMinutes(10));
        Assert.Equal(0, await AnnounceAsync());

        Assert.Empty(Announcements());
        Assert.Empty(_emails.Sent);
    }

    [Fact]
    public async Task Emails_a_new_video_to_every_confirmed_subscriber()
    {
        await AnnounceAsync();
        _time.Advance(TimeSpan.FromHours(1));
        await UploadAsync(PublishedAt("new", _time.GetUtcNow(), "Building a lighthouse", "How it was made. [More](https://example.com)"));

        Assert.Equal(1, await AnnounceAsync());

        Assert.Equal(["ana@example.com", "bob@example.com"], _emails.Sent.Select(e => e.To));
        var email = _emails.Sent[0];
        Assert.Contains("Building a lighthouse", email.Subject + email.Html);
        Assert.Contains("https://www.youtube.com/watch?v=new", email.Html);
        Assert.Contains("https://i.ytimg.com/vi/new/hqdefault.jpg", email.Html);
        Assert.Contains("How it was made. More", email.Text);
        Assert.Equal("https://jechel.dev/api/updates/unsubscribe?token=t-ana", email.UnsubscribeUrl);
        Assert.Contains("https://jechel.dev/updates/unsubscribe?token=t-ana", email.Html);

        var announcement = Assert.Single(Announcements());
        Assert.Equal((UpdatesAnnouncer.VideoKind, "new", AnnouncementStatus.Sent, 2), (announcement.Kind, announcement.ItemKey, announcement.Status, announcement.RecipientCount));
        Assert.Equal(_time.GetUtcNow(), announcement.SentAt);
        Assert.Equal("Emailed: Building a lighthouse", Assert.Single(_alerts.Sent).Title);
    }

    [Fact]
    public async Task Emails_each_video_once()
    {
        await AnnounceAsync();
        _time.Advance(TimeSpan.FromHours(1));
        await UploadAsync(PublishedAt("new", _time.GetUtcNow()));
        await AnnounceAsync();

        _time.Advance(TimeSpan.FromHours(1));
        Assert.Equal(0, await AnnounceAsync());

        Assert.Equal(2, _emails.Sent.Count);
    }

    [Fact]
    public async Task Leaves_out_videos_published_before_updates_started()
    {
        await AnnounceAsync();
        _time.Advance(TimeSpan.FromHours(1));
        // Made public now, but published (e.g. as unlisted) before the start.
        await UploadAsync(PublishedAt("backdated", Start - TimeSpan.FromDays(1)));

        Assert.Equal(0, await AnnounceAsync());
        Assert.Empty(Announcements());
    }

    [Fact]
    public async Task Sends_at_most_three_a_run_oldest_first_and_the_rest_next_time()
    {
        await AnnounceAsync();
        _time.Advance(TimeSpan.FromHours(1));
        var now = _time.GetUtcNow();
        await UploadAsync([.. Enumerable.Range(1, 4).Select(n => PublishedAt($"v{n}", now - TimeSpan.FromMinutes(10 - n)))]);

        Assert.Equal(UpdatesAnnouncer.MaxItemsPerRun, await AnnounceAsync());
        Assert.Equal(["v1", "v2", "v3"], Announcements().Where(a => a.Status == AnnouncementStatus.Sent).Select(a => a.ItemKey));

        Assert.Equal(1, await AnnounceAsync());
        Assert.All(Announcements(), a => Assert.Equal(AnnouncementStatus.Sent, a.Status));
    }

    [Fact]
    public async Task Skips_a_video_taken_down_before_it_was_emailed()
    {
        await AnnounceAsync();
        _time.Advance(TimeSpan.FromHours(1));
        await UploadAsync(PublishedAt("gone", _time.GetUtcNow()));
        using (var db = _db.Open())
        {
            // Found, but not emailed yet (e.g. the run stopped before sending).
            db.Announcements.Add(new Announcement { Kind = UpdatesAnnouncer.VideoKind, ItemKey = "removed", Title = "Removed", Status = AnnouncementStatus.Approved, CreatedAt = Start });
            db.SaveChanges();
        }

        await AnnounceAsync();

        Assert.Equal(AnnouncementStatus.Ignored, Announcements().Single(a => a.ItemKey == "removed").Status);
        Assert.Equal(AnnouncementStatus.Sent, Announcements().Single(a => a.ItemKey == "gone").Status);
    }

    [Fact]
    public async Task Keeps_a_long_title_to_200_characters()
    {
        await AnnounceAsync();
        _time.Advance(TimeSpan.FromHours(1));
        await UploadAsync(PublishedAt("long", _time.GetUtcNow(), new string('x', 250)));

        await AnnounceAsync();

        Assert.Equal(200, Assert.Single(Announcements()).Title.Length);
    }

    [Fact]
    public async Task Announces_no_videos_until_YouTube_is_set_up()
    {
        await AnnounceAsync();
        _time.Advance(TimeSpan.FromHours(1));
        await UploadAsync(PublishedAt("new", _time.GetUtcNow()));
        _options.ApiKey = "";

        Assert.Equal(0, await AnnounceAsync());
        Assert.Empty(Announcements());
    }

    [Fact]
    public async Task Announces_nothing_while_theres_no_list_and_YouTube_is_down()
    {
        await AnnounceAsync();
        _youTube.Fails = true;

        Assert.Equal(0, await AnnounceAsync());
        Assert.Empty(_emails.Sent);
    }

    [Fact]
    public async Task Counts_only_the_emails_that_went_out()
    {
        await AnnounceAsync();
        _time.Advance(TimeSpan.FromHours(1));
        await UploadAsync(PublishedAt("new", _time.GetUtcNow()));
        _emails.FailFor = "bob@example.com";

        await AnnounceAsync();

        Assert.Equal(1, Assert.Single(Announcements()).RecipientCount);
        Assert.Contains("went to 1 of 2 subscribers", Assert.Single(_alerts.Sent).Message);
    }

    private sealed class SentEmails : IEmailSender
    {
        public List<EmailMessage> Sent { get; } = [];
        public string? FailFor { get; set; }

        public Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
        {
            if (message.To == FailFor) throw new HttpRequestException("Resend is down");
            Sent.Add(message);
            return Task.CompletedTask;
        }
    }

    private sealed class SentAlerts : IPhoneAlerts
    {
        public List<PhoneAlert> Sent { get; } = [];
        public void Send(PhoneAlert alert) => Sent.Add(alert);
        public void SendThrottled(string key, PhoneAlert alert) => Sent.Add(alert);
    }
}
