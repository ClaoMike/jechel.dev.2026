using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Updates;
using Portfolio.Api.UnitTests.Features.Alerts;

namespace Portfolio.Api.UnitTests.Features.Updates;

public class UpdatesEndpointsTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 18, 12, 0, 0, TimeSpan.Zero);

    private readonly FakeTimeProvider _time = new(Now);
    private readonly FakeEmailSender _emails = new();
    private readonly FakePhoneAlerts _alerts = new();
    private readonly IOptions<SiteOptions> _site = Options.Create(new SiteOptions { PublicUrl = "https://jechel.dev" });
    private readonly PortfolioDbContext _db = new(new DbContextOptionsBuilder<PortfolioDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    private Task<Results<Ok<SubscribeResult>, ValidationProblem, ProblemHttpResult>> Subscribe(string? email) =>
        UpdatesEndpoints.Subscribe(new SubscribeRequest(email), _db, _emails, _site, _alerts, _time, NullLoggerFactory.Instance, CancellationToken.None);

    private static string StatusOf(Results<Ok<SubscribeResult>, ValidationProblem, ProblemHttpResult> result) =>
        Assert.IsType<Ok<SubscribeResult>>(result.Result).Value!.Status;

    [Fact]
    public async Task Subscribe_stores_the_address_unconfirmed_and_emails_a_confirmation_link()
    {
        var result = await Subscribe("  Ada@Example.com ");

        Assert.Equal(SubscribeStatus.Sent, StatusOf(result));
        var subscriber = await _db.Subscribers.SingleAsync();
        Assert.Equal("ada@example.com", subscriber.Email);
        Assert.Null(subscriber.ConfirmedAt);
        var email = Assert.Single(_emails.Sent);
        Assert.Equal("ada@example.com", email.To);
        Assert.Contains($"https://jechel.dev/updates/confirm?token={subscriber.Token}", email.Text);
    }

    [Fact]
    public async Task Subscribe_rejects_an_invalid_address()
    {
        var result = await Subscribe("nope");

        var problem = Assert.IsType<ValidationProblem>(result.Result);
        Assert.Equal(["email"], problem.ProblemDetails.Errors.Keys);
        Assert.Empty(_emails.Sent);
    }

    [Fact]
    public async Task Subscribing_again_says_a_confirmation_is_on_its_way_or_that_they_are_subscribed_and_sends_nothing()
    {
        await Subscribe("ada@example.com");
        Assert.Equal(SubscribeStatus.Pending, StatusOf(await Subscribe("ada@example.com")));
        Assert.Single(_emails.Sent);

        _time.Advance(UpdatesEndpoints.ConfirmationCooldown);
        await Subscribe("ada@example.com");
        Assert.Equal(2, _emails.Sent.Count);

        (await _db.Subscribers.SingleAsync()).ConfirmedAt = Now;
        await _db.SaveChangesAsync();
        _time.Advance(UpdatesEndpoints.ConfirmationCooldown);
        Assert.Equal(SubscribeStatus.AlreadySubscribed, StatusOf(await Subscribe("ada@example.com")));
        Assert.Equal(2, _emails.Sent.Count);
    }

    [Fact]
    public async Task When_the_email_fails_they_hear_so_and_can_try_again_at_once()
    {
        _emails.Fail = true;
        var result = await Subscribe("ada@example.com");
        Assert.Equal(503, Assert.IsType<ProblemHttpResult>(result.Result).StatusCode);
        var (key, alert) = Assert.Single(_alerts.Throttled);
        Assert.Equal("Emails aren't going out", alert.Title);
        Assert.Contains("couldn't be reached", alert.Message);

        _emails.Fail = false;
        await Subscribe("ada@example.com");
        Assert.Single(_emails.Sent);
    }

    [Fact]
    public async Task Confirm_marks_them_confirmed_once_and_alerts_the_phone()
    {
        await Subscribe("ada@example.com");
        var token = (await _db.Subscribers.SingleAsync()).Token;

        var first = await UpdatesEndpoints.Confirm(token, _db, _alerts, _time, CancellationToken.None);
        await UpdatesEndpoints.Confirm(token, _db, _alerts, _time, CancellationToken.None);

        Assert.Equal("ada@example.com", Assert.IsType<Ok<ConfirmedSubscription>>(first.Result).Value!.Email);
        Assert.Equal(Now, (await _db.Subscribers.SingleAsync()).ConfirmedAt);
        Assert.Equal("New subscriber", Assert.Single(_alerts.Sent).Title);
        Assert.IsType<NotFound>((await UpdatesEndpoints.Confirm("unknown", _db, _alerts, _time, CancellationToken.None)).Result);
    }

    [Fact]
    public async Task Unsubscribe_deletes_them_and_is_fine_with_unknown_tokens()
    {
        await Subscribe("ada@example.com");
        var token = (await _db.Subscribers.SingleAsync()).Token;

        await UpdatesEndpoints.Unsubscribe(token, _db, CancellationToken.None);
        await UpdatesEndpoints.Unsubscribe(token, _db, CancellationToken.None);
        await UpdatesEndpoints.Unsubscribe(null, _db, CancellationToken.None);

        Assert.Empty(_db.Subscribers);
    }

    [Fact]
    public void Tokens_are_long_random_and_url_safe()
    {
        var a = UpdatesEndpoints.NewToken();
        var b = UpdatesEndpoints.NewToken();

        Assert.NotEqual(a, b);
        Assert.Equal(43, a.Length);
        Assert.Matches("^[A-Za-z0-9_-]+$", a);
    }

    [Fact]
    public void Summary_drops_link_syntax_and_cuts_at_a_word()
    {
        Assert.Equal("Made with Unity.", UpdateEmails.Summary("Made with [Unity](https://unity.com)."));
        Assert.Equal("one two…", UpdateEmails.Summary("one two three", 10));
    }

    [Fact]
    public void The_new_item_email_encodes_what_it_shows_and_offers_unsubscribing()
    {
        var email = UpdateEmails.NewItem("a@example.com", "app", new UpdateItem("<script>", "Fish & chips", "https://jechel.dev/", null), "t", UpdateEmailDefaults.Wording, _site.Value);

        Assert.Contains("&lt;script&gt;", email.Html);
        Assert.DoesNotContain("<script>", email.Html);
        Assert.Contains("Fish &amp; chips", email.Html);
        Assert.Equal("https://jechel.dev/api/updates/unsubscribe?token=t", email.UnsubscribeUrl);
    }

    // ---------- Subscribing: every way in ----------

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("ada@")]
    [InlineData("@example.com")]
    [InlineData("ada example@example.com")]
    public async Task Subscribe_rejects_a_missing_or_malformed_address_and_stores_nothing(string? email)
    {
        var problem = Assert.IsType<ValidationProblem>((await Subscribe(email)).Result);

        Assert.Equal(["Enter a valid email address."], problem.ProblemDetails.Errors["email"]);
        Assert.Empty(_db.Subscribers);
        Assert.Empty(_emails.Sent);
    }

    [Fact]
    public async Task Subscribe_rejects_an_address_longer_than_the_column()
    {
        var local = new string('a', Portfolio.Api.Features.Contact.ContactRules.EmailMaxLength);

        Assert.IsType<ValidationProblem>((await Subscribe($"{local}@example.com")).Result);
        Assert.Empty(_db.Subscribers);
    }

    [Fact]
    public async Task The_same_address_in_other_letters_is_the_same_subscriber()
    {
        await Subscribe("Ada@Example.com");
        _time.Advance(UpdatesEndpoints.ConfirmationCooldown);
        await Subscribe("ADA@EXAMPLE.COM");

        var subscriber = Assert.Single(_db.Subscribers);
        Assert.Equal("ada@example.com", subscriber.Email);
        Assert.Equal(2, _emails.Sent.Count);
        Assert.All(_emails.Sent, e => Assert.Equal("ada@example.com", e.To));
    }

    [Fact]
    public async Task Asking_again_after_the_cooldown_resends_the_same_link()
    {
        await Subscribe("ada@example.com");
        var token = _db.Subscribers.Single().Token;

        _time.Advance(UpdatesEndpoints.ConfirmationCooldown - TimeSpan.FromSeconds(1));
        Assert.Equal(SubscribeStatus.Pending, StatusOf(await Subscribe("ada@example.com")));
        _time.Advance(TimeSpan.FromSeconds(1));
        Assert.Equal(SubscribeStatus.Sent, StatusOf(await Subscribe("ada@example.com")));

        Assert.Equal(2, _emails.Sent.Count);
        Assert.All(_emails.Sent, e => Assert.Contains($"token={token}", e.Text));
        Assert.Equal(Now.AddMinutes(10), _db.Subscribers.Single().ConfirmationSentAt);
        Assert.Equal(Now, _db.Subscribers.Single().CreatedAt);
    }

    [Fact]
    public async Task Subscribing_again_after_unsubscribing_starts_afresh_and_the_old_links_stop_working()
    {
        await Subscribe("ada@example.com");
        var old = _db.Subscribers.Single().Token;
        await UpdatesEndpoints.Confirm(old, _db, _alerts, _time, default);
        await UpdatesEndpoints.Unsubscribe(old, _db, default);

        Assert.Equal(SubscribeStatus.Sent, StatusOf(await Subscribe("ada@example.com")));

        var again = _db.Subscribers.Single();
        Assert.NotEqual(old, again.Token);
        Assert.Null(again.ConfirmedAt);
        Assert.IsType<NotFound>((await UpdatesEndpoints.Confirm(old, _db, _alerts, _time, default)).Result);
    }

    [Fact]
    public async Task The_confirmation_comes_from_the_updates_sender_in_the_saved_wording_with_no_unsubscribe_header()
    {
        await Subscribe("ada@example.com");

        var email = Assert.Single(_emails.Sent);
        Assert.True(email.FromUpdates);
        Assert.Null(email.ReplyTo);
        Assert.Null(email.UnsubscribeUrl);
        Assert.Equal(UpdateEmailDefaults.Wording.Confirm.Subject, email.Subject);
    }

    [Fact]
    public async Task When_the_email_service_refuses_the_alert_gives_its_reason()
    {
        _emails.FailWith = new Portfolio.Api.Features.Settings.ServiceException("Resend refused it: The jechel.dev domain is not verified.");

        await Subscribe("ada@example.com");

        var (key, alert) = Assert.Single(_alerts.Throttled);
        Assert.Equal("email:Resend refused it: The jechel.dev domain is not verified.", key);
        Assert.Equal("A visitor couldn't subscribe. Resend refused it: The jechel.dev domain is not verified.", alert.Message);
        Assert.Equal("/settings", alert.Path);
        // Kept, so trying again doesn't wait for the cooldown.
        Assert.Equal(default, _db.Subscribers.Single().ConfirmationSentAt);
    }

    [Fact]
    public async Task Subscribing_while_updates_are_switched_off_is_turned_away()
    {
        using var services = TestSite.Services(visibleByDefault: false);
        var result = await UpdatesEndpoints.Subscribe(new SubscribeRequest("ada@example.com"), _db, _emails, _site, _alerts, _time, NullLoggerFactory.Instance, default, services.Cache(), services);

        Assert.Equal(404, Assert.IsType<ProblemHttpResult>(result.Result).StatusCode);
        Assert.Empty(_db.Subscribers);
        Assert.Empty(_emails.Sent);
    }

    // ---------- Confirming and unsubscribing ----------

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    [InlineData("test")]
    public async Task Confirm_finds_no_one_for_a_missing_unknown_or_test_code(string? token)
    {
        await Subscribe("ada@example.com");

        Assert.IsType<NotFound>((await UpdatesEndpoints.Confirm(token, _db, _alerts, _time, default)).Result);
        Assert.Null(_db.Subscribers.Single().ConfirmedAt);
        Assert.Empty(_alerts.Sent);
    }

    [Fact]
    public async Task A_code_longer_than_any_real_one_isnt_looked_up()
    {
        await Subscribe("ada@example.com");
        var token = _db.Subscribers.Single().Token;

        Assert.IsType<NotFound>((await UpdatesEndpoints.Confirm(token + new string('x', 100), _db, _alerts, _time, default)).Result);
        Assert.IsType<Ok<ConfirmedSubscription>>((await UpdatesEndpoints.Confirm($" {token} ", _db, _alerts, _time, default)).Result);
    }

    [Fact]
    public async Task The_new_subscriber_alert_counts_only_confirmed_ones()
    {
        foreach (var name in new[] { "ada", "bob", "cy" }) await Subscribe($"{name}@example.com");
        var tokens = _db.Subscribers.OrderBy(s => s.Email).Select(s => s.Token).ToList();

        await UpdatesEndpoints.Confirm(tokens[0], _db, _alerts, _time, default);
        await UpdatesEndpoints.Confirm(tokens[2], _db, _alerts, _time, default);

        Assert.Equal(["ada@example.com (1 in all)", "cy@example.com (2 in all)"], _alerts.Sent.Select(a => a.Message));
        Assert.All(_alerts.Sent, a => Assert.Equal("/community", a.Path));
    }

    [Fact]
    public async Task Unsubscribing_one_leaves_the_others()
    {
        await Subscribe("ada@example.com");
        await Subscribe("bob@example.com");

        await UpdatesEndpoints.Unsubscribe(_db.Subscribers.Single(s => s.Email == "ada@example.com").Token, _db, default);

        Assert.Equal("bob@example.com", Assert.Single(_db.Subscribers).Email);
    }

    [Theory]
    [InlineData("abc", "https://jechel.dev/updates/unsubscribe?token=abc")]
    [InlineData("a+b/c=", "https://jechel.dev/updates/unsubscribe?token=a%2Bb%2Fc%3D")]
    [InlineData(null, "https://jechel.dev/updates/unsubscribe?token=")]
    public void Opening_the_unsubscribe_link_leads_to_the_sites_page_and_changes_nothing(string? token, string page)
    {
        var result = UpdatesEndpoints.OpenUnsubscribePage(token, _site);

        Assert.Equal(page, result.Url);
        Assert.False(result.Permanent);
    }

    // ---------- The admin's lists ----------

    [Fact]
    public async Task The_admin_lists_subscribers_newest_first_a_page_at_a_time()
    {
        for (var i = 1; i <= 5; i++)
        {
            await Subscribe($"reader{i}@example.com");
            _time.Advance(TimeSpan.FromMinutes(1));
        }

        var first = (await UpdatesEndpoints.ListSubscribers(_db, default, page: 1, pageSize: 2)).Value!;
        var last = (await UpdatesEndpoints.ListSubscribers(_db, default, page: 3, pageSize: 2)).Value!;

        Assert.Equal(["reader5@example.com", "reader4@example.com"], first.Items.Select(s => s.Email));
        Assert.Equal(["reader1@example.com"], last.Items.Select(s => s.Email));
        Assert.Equal(5, first.TotalCount);
    }

    [Theory]
    [InlineData(0, 0, 1, 1)]
    [InlineData(-3, 500, 1, UpdatesEndpoints.MaxPageSize)]
    public async Task Page_numbers_and_sizes_out_of_range_are_brought_into_it(int page, int pageSize, int expectedPage, int expectedSize)
    {
        var subscribers = (await UpdatesEndpoints.ListSubscribers(_db, default, page, pageSize)).Value!;
        var announcements = (await UpdatesEndpoints.ListAnnouncements(_db, default, page, pageSize)).Value!;

        Assert.Equal((expectedPage, expectedSize), (subscribers.Page, subscribers.PageSize));
        Assert.Equal((expectedPage, expectedSize), (announcements.Page, announcements.PageSize));
    }

    [Fact]
    public async Task Deleting_a_subscriber_that_is_gone_is_not_found()
    {
        await Subscribe("ada@example.com");
        var id = _db.Subscribers.Single().Id;

        Assert.IsType<NoContent>((await UpdatesEndpoints.DeleteSubscriber(id, _db, default)).Result);
        Assert.IsType<NotFound>((await UpdatesEndpoints.DeleteSubscriber(id, _db, default)).Result);
    }

    [Fact]
    public async Task The_update_emails_are_listed_newest_first_with_how_many_got_each()
    {
        _db.Announcements.AddRange(
            new Announcement { Kind = "video", ItemKey = "v1", Title = "Old", Status = AnnouncementStatus.Sent, CreatedAt = Now.AddDays(-2), SentAt = Now.AddDays(-2), RecipientCount = 4 },
            new Announcement { Kind = "app", ItemKey = "1", Title = "New", Status = AnnouncementStatus.Pending, CreatedAt = Now });
        await _db.SaveChangesAsync();

        var list = (await UpdatesEndpoints.ListAnnouncements(_db, default)).Value!;

        Assert.Equal(["New", "Old"], list.Items.Select(a => a.Title));
        Assert.Equal(4, list.Items[1].RecipientCount);
        Assert.Null(list.Items[0].SentAt);
    }

    // ---------- Deciding about a new app ----------

    [Fact]
    public async Task Deciding_an_unknown_email_is_not_found_and_deciding_twice_keeps_the_first_answer()
    {
        _db.Announcements.Add(new Announcement { Kind = "app", ItemKey = "1", Title = "Game", Status = AnnouncementStatus.Pending, CreatedAt = Now, DecisionTokenHash = AnnouncementDecisions.Hash("tok") });
        await _db.SaveChangesAsync();
        var id = _db.Announcements.Single().Id;
        var trigger = new UpdatesTrigger();
        var phone = new Microsoft.AspNetCore.Http.DefaultHttpContext();

        Assert.IsType<NotFound>((await UpdatesEndpoints.Decide(id + 1, "tok", AnnouncementStatus.Approved, phone, _db, trigger, default)).Result);
        var ignored = await UpdatesEndpoints.Decide(id, "tok", AnnouncementStatus.Ignored, phone, _db, trigger, default);
        // The token is used up: the phone's other button now can't change it, the signed-in admin hears how it was decided.
        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.UnauthorizedHttpResult>((await UpdatesEndpoints.Decide(id, "tok", AnnouncementStatus.Approved, phone, _db, trigger, default)).Result);

        Assert.Equal(AnnouncementStatus.Ignored, Assert.IsType<Ok<DecisionResult>>(ignored.Result).Value!.Status);
        Assert.Null(_db.Announcements.Single().DecisionTokenHash);
        Assert.False(await trigger.WaitAsync(TimeSpan.Zero, default));
    }

    [Fact]
    public async Task Sending_wakes_the_announcer_at_once()
    {
        _db.Announcements.Add(new Announcement { Kind = "app", ItemKey = "1", Title = "Game", Status = AnnouncementStatus.Pending, CreatedAt = Now, DecisionTokenHash = AnnouncementDecisions.Hash("tok") });
        await _db.SaveChangesAsync();
        var trigger = new UpdatesTrigger();

        await UpdatesEndpoints.Decide(_db.Announcements.Single().Id, "tok", AnnouncementStatus.Approved, new Microsoft.AspNetCore.Http.DefaultHttpContext(), _db, trigger, default);

        Assert.True(await trigger.WaitAsync(TimeSpan.Zero, default));
        Assert.Equal(AnnouncementStatus.Approved, _db.Announcements.Single().Status);
    }
}
