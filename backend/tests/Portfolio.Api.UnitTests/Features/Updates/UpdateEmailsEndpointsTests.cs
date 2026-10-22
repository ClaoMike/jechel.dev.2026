using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Settings;
using Portfolio.Api.Features.Updates;
using Portfolio.Api.Features.YouTube;
using Portfolio.Api.UnitTests.Features.Alerts;
using Portfolio.Api.UnitTests.Features.YouTube;

namespace Portfolio.Api.UnitTests.Features.Updates;

/// <summary>The admin's editor for the emails subscribers get: saving the wording, previewing it, and a test email.</summary>
public class UpdateEmailsEndpointsTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 21, 20, 0, 0, TimeSpan.Zero);
    private static readonly UpdateEmailWording Defaults = UpdateEmailDefaults.Wording;
    private static readonly UpdateEmailWording Mine = Defaults with { Confirm = Defaults.Confirm with { Subject = "Say yes to jechel.dev" }, App = new ItemWording("Out now: {title}", "Just shipped", "Try it", "") };

    private readonly FakeTimeProvider _time = new(Now);
    private readonly FakeEmailSender _emails = new();
    private readonly SiteOptions _site = new() { PublicUrl = "https://jechel.dev", PagesVisibleByDefault = true };
    private readonly TestDatabase _database = new();
    private readonly PortfolioDbContext _db;
    private readonly FakeYouTubeClient _youTube = new();
    private YouTubeOptions _youTubeOptions = new() { Channel = "@me", ApiKey = "key" };
    private EmailOptions _emailOptions = new() { ResendApiKey = "re_key", From = "Claudiu <hello@jechel.dev>", UpdatesFrom = "jechel.dev <updates@jechel.dev>" };

    public UpdateEmailsEndpointsTests()
    {
        UpdatesAnnouncer.DelayBetweenEmails = TimeSpan.Zero;
        _db = _database.Open();
    }

    private static ClaimsPrincipal Admin(string? email = "admin@example.com") =>
        new(new ClaimsIdentity(email is null ? [] : [new Claim(ClaimTypes.Email, email)], "Google"));

    private YouTubeVideoStore Videos() => new(_database.Scopes, _youTube, TestOptions.Monitor(_youTubeOptions), _time, NullLogger<YouTubeVideoStore>.Instance);

    private async Task<UpdateEmailsDocument> Get() => (await UpdateEmailsEndpoints.GetWording(_db, default)).Value!;

    private async Task<Results<Ok<UpdateEmailsDocument>, ValidationProblem>> Save(UpdateEmailWording wording) =>
        await UpdateEmailsEndpoints.SaveWording(wording, _db, _time, default);

    private async Task<Results<Ok<UpdateEmailPreview>, ValidationProblem>> Preview(string? kind, UpdateEmailWording? wording = null, YouTubeVideoStore? videos = null) =>
        await UpdateEmailsEndpoints.Preview(new UpdateEmailPreviewRequest(kind, wording ?? Defaults), _db, Options.Create(_site), TestOptions.Monitor(_emailOptions), TestOptions.Monitor(_youTubeOptions), videos ?? Videos(), Admin(), default);

    private static UpdateEmailPreview Shown(Results<Ok<UpdateEmailPreview>, ValidationProblem> result) => Assert.IsType<Ok<UpdateEmailPreview>>(result.Result).Value!;

    private async Task<Results<Ok<TestResult>, ValidationProblem>> Test(string kind, UpdateEmailWording? wording = null, IEmailSender? sender = null, ClaimsPrincipal? admin = null) =>
        await UpdateEmailsEndpoints.SendTest(new UpdateEmailPreviewRequest(kind, wording ?? Defaults), _db, sender ?? _emails, Options.Create(_site), TestOptions.Monitor(_youTubeOptions), Videos(), admin ?? Admin(), default);

    private static TestResult Outcome(Results<Ok<TestResult>, ValidationProblem> result) => Assert.IsType<Ok<TestResult>>(result.Result).Value!;

    private async Task<AppEntry> AddApp(string title, DateTimeOffset createdAt, string media = "[]")
    {
        var app = new AppEntry { Title = title, Description = $"About {title}.", Media = media, CreatedAt = createdAt, UpdatedAt = createdAt };
        _db.Apps.Add(app);
        await _db.SaveChangesAsync();
        return app;
    }

    // ---------- The wording ----------

    [Fact]
    public async Task Until_the_admin_saves_their_own_the_defaults_apply()
    {
        var document = await Get();

        Assert.Equal(Defaults, document.Wording);
        Assert.Equal(Defaults, document.Defaults);
        Assert.Null(document.UpdatedAt);
    }

    [Fact]
    public async Task Saving_keeps_the_wording_trimmed_and_dated_and_it_is_what_comes_back()
    {
        var result = await Save(Mine with { Footer = new FooterWording("  Why. ", "No replies.\r\n") });

        var saved = Assert.IsType<Ok<UpdateEmailsDocument>>(result.Result).Value!;
        Assert.Equal(new FooterWording("Why.", "No replies."), saved.Wording.Footer);
        Assert.Equal(Now, saved.UpdatedAt);
        Assert.Equal(Defaults, saved.Defaults);
        Assert.Equal(saved.Wording, (await Get()).Wording);

        _time.Advance(TimeSpan.FromHours(1));
        await Save(Mine);
        Assert.Equal(Now.AddHours(1), (await Get()).UpdatedAt);
        Assert.Single(_db.UpdateEmailsPages);
    }

    [Fact]
    public async Task Wording_that_breaks_the_rules_isnt_saved()
    {
        var result = await Save(Mine with { Video = Mine.Video with { Subject = "" } });

        var problem = Assert.IsType<ValidationProblem>(result.Result);
        Assert.Equal(["video.subject"], problem.ProblemDetails.Errors.Keys);
        Assert.Null((await Get()).UpdatedAt);
    }

    [Fact]
    public async Task Resetting_goes_back_to_the_defaults_also_when_nothing_was_saved()
    {
        await Save(Mine);

        var reset = (await UpdateEmailsEndpoints.ResetWording(_db, default)).Value!;
        var again = (await UpdateEmailsEndpoints.ResetWording(_db, default)).Value!;

        Assert.Equal(Defaults, reset.Wording);
        Assert.Null(reset.UpdatedAt);
        Assert.Equal(Defaults, again.Wording);
        Assert.Equal(Defaults, (await Get()).Wording);
        Assert.Empty(_db.UpdateEmailsPages);
    }

    [Fact]
    public async Task A_new_subscriber_gets_the_confirmation_in_the_saved_wording()
    {
        await Save(Mine);

        await UpdatesEndpoints.Subscribe(new SubscribeRequest("ada@example.com"), _db, _emails, Options.Create(_site), new FakePhoneAlerts(), _time, NullLoggerFactory.Instance, default);

        var email = Assert.Single(_emails.Sent);
        Assert.Equal("Say yes to jechel.dev", email.Subject);
        Assert.True(email.FromUpdates);
    }

    [Fact]
    public async Task Subscribers_get_a_new_app_in_the_saved_wording()
    {
        await Save(Mine);
        _db.Subscribers.Add(new Subscriber { Email = "ada@example.com", Token = "t", CreatedAt = Now, ConfirmedAt = Now });
        var app = await AddApp("Space Game", Now);
        _db.Announcements.Add(new Announcement { Kind = UpdatesAnnouncer.AppKind, ItemKey = app.Id.ToString(), Title = app.Title, Status = AnnouncementStatus.Approved, CreatedAt = Now });
        _db.UpdatesStates.Add(new UpdatesState { Id = UpdatesState.SingletonId, AnnounceAfter = Now.AddDays(-1) });
        await _db.SaveChangesAsync();
        var announcer = new UpdatesAnnouncer(_db, _emails, Options.Create(_site), TestOptions.Monitor(new YouTubeOptions()), Videos(), new FakePhoneAlerts(), _time, NullLogger<UpdatesAnnouncer>.Instance);

        Assert.Equal(1, await announcer.AnnounceNewAsync(default));

        var email = Assert.Single(_emails.Sent);
        Assert.Equal("Out now: Space Game", email.Subject);
        Assert.Contains(">Try it</a>", email.Html);
        Assert.True(email.FromUpdates);
    }

    // ---------- The preview ----------

    [Fact]
    public async Task The_preview_shows_the_unsaved_wording_from_the_updates_sender_to_the_admin()
    {
        var preview = Shown(await Preview(UpdateEmailKinds.Confirm, Mine));

        Assert.Equal("Say yes to jechel.dev", preview.Subject);
        Assert.Equal("jechel.dev <updates@jechel.dev>", preview.From);
        Assert.Contains("https://jechel.dev/updates/confirm?token=test", preview.Html);
        Assert.Contains("Yes, send me updates: https://jechel.dev/updates/confirm?token=test", preview.Text);
        Assert.Null((await Get()).UpdatedAt);
    }

    [Fact]
    public async Task Without_an_updates_sender_the_preview_says_it_comes_from_the_main_one()
    {
        _emailOptions = new EmailOptions { ResendApiKey = "re_key", From = "Claudiu <hello@jechel.dev>" };

        Assert.Equal("Claudiu <hello@jechel.dev>", Shown(await Preview(UpdateEmailKinds.Video)).From);
    }

    [Fact]
    public async Task The_app_preview_shows_the_newest_app_with_its_picture()
    {
        await AddApp("Old App", Now.AddDays(-9));
        await AddApp("Space Game", Now.AddDays(-1), """[{"url":"/api/files/7/shot.webp","kind":"image"}]""");

        var preview = Shown(await Preview(UpdateEmailKinds.App, Mine));

        Assert.Equal("Out now: Space Game", preview.Subject);
        Assert.Contains("https://jechel.dev/api/files/7/shot.webp", preview.Html);
        Assert.Contains("https://jechel.dev/updates/unsubscribe?token=test", preview.Html);
        Assert.DoesNotContain("Old App", preview.Html);
    }

    [Fact]
    public async Task The_video_preview_shows_the_newest_video()
    {
        _youTube.Videos = [FakeYouTubeClient.Video("older", 1), FakeYouTubeClient.Video("newest", 5), FakeYouTubeClient.Video("middle", 3)];
        var videos = Videos();
        await videos.RefreshAsync(default);

        var preview = Shown(await Preview(UpdateEmailKinds.Video, videos: videos));

        Assert.Equal("A new video is up: Video newest", preview.Subject);
        Assert.Contains("https://www.youtube.com/watch?v=newest", preview.Html);
        Assert.Contains("https://i.ytimg.com/vi/newest/hqdefault.jpg", preview.Html);
    }

    [Fact]
    public async Task With_no_app_or_video_yet_the_preview_makes_one_up()
    {
        _youTubeOptions = new YouTubeOptions();

        var app = Shown(await Preview(UpdateEmailKinds.App));
        var video = Shown(await Preview(UpdateEmailKinds.Video));

        Assert.Equal("A new app is out: Space Game", app.Subject);
        Assert.Equal("A new video is up: How I built a game in a weekend", video.Subject);
    }

    [Fact]
    public async Task The_preview_checks_the_wording_and_the_kind_of_email()
    {
        var bad = Assert.IsType<ValidationProblem>((await Preview("newsletter", Mine with { App = Mine.App with { Button = "" } })).Result);
        var missing = Assert.IsType<ValidationProblem>((await UpdateEmailsEndpoints.Preview(new UpdateEmailPreviewRequest(null, null), _db, Options.Create(_site), TestOptions.Monitor(_emailOptions), TestOptions.Monitor(_youTubeOptions), Videos(), Admin(), default)).Result);

        Assert.Equal(["app.button", "kind"], bad.ProblemDetails.Errors.Keys.Order());
        Assert.Equal(["", "kind"], missing.ProblemDetails.Errors.Keys.Order());
    }

    // ---------- The test email ----------

    [Fact]
    public async Task A_test_goes_to_the_admin_marked_as_a_test_in_the_unsaved_wording()
    {
        var result = Outcome(await Test(UpdateEmailKinds.App, Mine));

        Assert.Equal(new TestResult(true, "Sent to admin@example.com."), result);
        var email = Assert.Single(_emails.Sent);
        Assert.Equal("admin@example.com", email.To);
        Assert.Equal("[Test] Out now: Space Game", email.Subject);
        Assert.True(email.FromUpdates);
        Assert.Equal("https://jechel.dev/api/updates/unsubscribe?token=test", email.UnsubscribeUrl);
        Assert.Equal([UpdateEmails.Icon], email.Images);
        Assert.Empty(_db.Subscribers);
    }

    [Fact]
    public void The_test_code_is_the_one_the_sites_pages_know()
    {
        // frontend/src/features/updates/useTokenAction.ts: TEST_TOKEN. Real codes are 43 random characters, never this.
        Assert.Equal("test", UpdateEmailsEndpoints.TestToken);
        Assert.NotEqual(UpdateEmailsEndpoints.TestToken.Length, UpdatesEndpoints.NewToken().Length);
    }

    [Fact]
    public async Task A_test_to_a_subscribed_admin_carries_their_own_code_so_unsubscribing_from_it_works()
    {
        _db.Subscribers.Add(new Subscriber { Email = "admin@example.com", Token = "admins-own", CreatedAt = Now, ConfirmedAt = Now });
        await _db.SaveChangesAsync();

        await Test(UpdateEmailKinds.Video, admin: Admin("Admin@Example.com"));
        var email = Assert.Single(_emails.Sent);
        Assert.Equal("https://jechel.dev/api/updates/unsubscribe?token=admins-own", email.UnsubscribeUrl);
        Assert.Contains("https://jechel.dev/updates/unsubscribe?token=admins-own", email.Html);

        await UpdatesEndpoints.Unsubscribe("admins-own", _db, default);
        Assert.Empty(_db.Subscribers);
    }

    [Fact]
    public async Task The_preview_shows_the_icon_written_into_the_page()
    {
        var preview = Shown(await Preview(UpdateEmailKinds.Confirm));

        Assert.Contains("<img src=\"data:image/png;base64,", preview.Html);
        Assert.DoesNotContain("cid:", preview.Html);
    }

    [Fact]
    public async Task Wording_saved_before_new_items_had_a_message_reads_its_heading_as_the_message()
    {
        _db.UpdateEmailsPages.Add(new UpdateEmailsPage
        {
            Id = UpdateEmailsPage.SingletonId,
            UpdatedAt = Now,
            Content = """
                {"confirm":{"subject":"S","intro":"I","button":"B","note":"N"},
                 "video":{"subject":"V {title}","heading":"A new video is up","button":"Watch it"},
                 "app":{"subject":"A {title}","heading":"A new app is out","button":"Take a look"},
                 "footer":{"reason":"R","noReply":"X"}}
                """,
        });
        await _db.SaveChangesAsync();

        var wording = (await Get()).Wording;

        Assert.Equal(new ItemWording("V {title}", "A new video is up", "Watch it", ""), wording.Video);
        Assert.Equal(new ItemWording("A {title}", "A new app is out", "Take a look", ""), wording.App);
        Assert.Empty(UpdateEmailRules.Validate(wording));
    }

    [Fact]
    public async Task A_test_needs_the_email_service_and_an_address_to_send_to()
    {
        var unset = new SwitchingEmailSender(null!, null!, TestOptions.Monitor(new EmailOptions()));

        Assert.Equal(new TestResult(false, "Set the Resend API key first (Settings → Resend)."), Outcome(await Test(UpdateEmailKinds.Confirm, sender: unset)));
        Assert.Equal(new TestResult(false, "Your sign-in has no email address to send it to."), Outcome(await Test(UpdateEmailKinds.Confirm, admin: Admin(null))));
        Assert.Empty(_emails.Sent);
    }

    [Fact]
    public async Task A_test_that_fails_says_why()
    {
        _emails.FailWith = new ServiceException("Resend refused it: The jechel.dev domain is not verified.");
        Assert.Equal(new TestResult(false, "Resend refused it: The jechel.dev domain is not verified."), Outcome(await Test(UpdateEmailKinds.Video)));

        _emails.FailWith = new HttpRequestException("down");
        Assert.Equal(new TestResult(false, "The email service couldn't be reached."), Outcome(await Test(UpdateEmailKinds.Video)));
    }

    [Fact]
    public async Task A_test_with_broken_wording_isnt_sent()
    {
        var result = await Test(UpdateEmailKinds.Confirm, Mine with { Confirm = Mine.Confirm with { Intro = "" } });

        Assert.Equal(["confirm.intro"], Assert.IsType<ValidationProblem>(result.Result).ProblemDetails.Errors.Keys);
        Assert.Empty(_emails.Sent);
    }
}
