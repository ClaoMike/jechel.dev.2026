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
        var email = UpdateEmails.NewItem("a@example.com", "app", "<script>", "Fish & chips", "https://jechel.dev/", null, "https://jechel.dev/updates/unsubscribe?token=t");

        Assert.Contains("&lt;script&gt;", email.Html);
        Assert.DoesNotContain("<script>", email.Html);
        Assert.Contains("Fish &amp; chips", email.Html);
        Assert.Equal("https://jechel.dev/updates/unsubscribe?token=t", email.UnsubscribeUrl);
    }
}
