using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Support;
using Portfolio.Api.UnitTests.Features.Alerts;

namespace Portfolio.Api.UnitTests.Features.Support;

public class SupportEndpointsTests
{
    private const string Secret = "bmc-secret";
    private static readonly DateTimeOffset Now = new(2026, 10, 18, 12, 0, 0, TimeSpan.Zero);

    private readonly FakeTimeProvider _time = new(Now);
    private readonly FakePhoneAlerts _alerts = new();
    private readonly PortfolioDbContext _db = new(new DbContextOptionsBuilder<PortfolioDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    private const string Donation = """{"type":"donation.created","live_mode":true,"data":{"id":58,"amount":5,"currency":"GBP","support_note":"Thanks for the game!","supporter_name":"Jo Example","supporter_email":"jo@example.com"}}""";

    private static string Sign(string body, string secret = Secret) => Convert.ToHexStringLower(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(body)));

    private static HttpRequest Request(string body, string? signature, string header = "X-Signature-Sha256")
    {
        var context = new DefaultHttpContext();
        var bytes = Encoding.UTF8.GetBytes(body);
        context.Request.Method = "POST";
        context.Request.ContentType = "application/json";
        context.Request.Body = new MemoryStream(bytes);
        context.Request.ContentLength = bytes.Length;
        if (signature is not null) context.Request.Headers[header] = signature;
        return context.Request;
    }

    private Task<Results<Ok, BadRequest, UnauthorizedHttpResult, ProblemHttpResult>> Webhook(HttpRequest request, string configured = Secret) =>
        SupportEndpoints.BuyMeACoffeeWebhook(request, _db, TestOptions.Monitor(new SupportOptions { BuyMeACoffeeWebhookSecret = configured }), _alerts, _time, CancellationToken.None);

    [Fact]
    public async Task A_signed_donation_is_stored_once_and_rings_the_phone_once()
    {
        Assert.IsType<Ok>((await Webhook(Request(Donation, Sign(Donation)))).Result);
        Assert.IsType<Ok>((await Webhook(Request(Donation, Sign(Donation).ToUpperInvariant(), "X-Bmc-Signature"))).Result);

        var donation = await _db.Donations.SingleAsync();
        Assert.Equal(("donation.created:58", "donation.created", "Jo Example", "5", "GBP", "jo@example.com"), (donation.TransactionId, donation.Type, donation.FromName, donation.Amount, donation.Currency, donation.Email));
        Assert.False(donation.IsTest);
        Assert.Equal(Donation, donation.Payload);
        var alert = Assert.Single(_alerts.Sent);
        Assert.Equal("☕ 5 GBP from Jo Example", alert.Title);
        Assert.Equal("Thanks for the game!", alert.Message);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("deadbeef")]
    public async Task A_missing_or_wrong_signature_is_refused(string? signature)
    {
        Assert.IsType<UnauthorizedHttpResult>((await Webhook(Request(Donation, signature ?? null))).Result);
        Assert.IsType<UnauthorizedHttpResult>((await Webhook(Request(Donation, Sign(Donation, "other-secret")))).Result);
        Assert.Empty(_db.Donations);
        Assert.Empty(_alerts.Sent);
    }

    [Fact]
    public async Task Without_a_secret_the_webhook_is_off()
    {
        var result = await Webhook(Request(Donation, Sign(Donation)), configured: "");

        Assert.Equal(503, Assert.IsType<ProblemHttpResult>(result.Result).StatusCode);
    }

    [Fact]
    public async Task Garbage_is_a_bad_request()
    {
        Assert.IsType<BadRequest>((await Webhook(Request("not json", Sign("not json")))).Result);
    }

    [Fact]
    public void The_older_shape_is_read_too()
    {
        var parsed = SupportEndpoints.ParseBuyMeACoffee("""{"response":{"supporter_email":"a@example.com","number_of_coffees":"1","total_amount":"5","support_created_on":"2021-08-01 16:00:00"}}""", "coffee-purchase");

        Assert.Equal(("coffee-purchase", "5", "a@example.com"), (parsed!.Type, parsed.Amount, parsed.Email));
        Assert.Null(parsed.Id);
    }

    [Theory]
    [InlineData("https://buymeacoffee.com/claomike", "https://buymeacoffee.com/claomike")]
    [InlineData("  https://ko-fi.com/jechel ", "https://ko-fi.com/jechel")]
    [InlineData("", "")]
    [InlineData("javascript:alert(1)", "")]
    [InlineData("/somewhere", "")]
    public async Task GetInfo_only_gives_out_web_links(string configured, string expected)
    {
        var services = TestSite.Services();
        var info = await SupportEndpoints.GetInfo(TestOptions.Monitor(new SupportOptions { Url = configured }), services.Cache(), services, default);

        Assert.Equal(expected, info.Value!.Url);
    }

    [Fact]
    public async Task GetInfo_hides_the_button_while_it_is_switched_off()
    {
        var services = TestSite.Services(visibleByDefault: false);

        var info = await SupportEndpoints.GetInfo(TestOptions.Monitor(new SupportOptions { Url = "https://buymeacoffee.com/claomike" }), services.Cache(), services, default);

        Assert.Equal("", info.Value!.Url);
    }

    // ---------- Every kind of event ----------

    /// <summary>A webhook body as Buy Me a Coffee sends it: the event, live or a test (null: older ones don't say), and its data's fields.</summary>
    private static string Event(string type, string data, bool? live = true)
    {
        var mode = live is { } isLive ? $",\"live_mode\":{(isLive ? "true" : "false")}" : "";
        return "{\"type\":\"" + type + "\"" + mode + ",\"data\":{" + data + "}}";
    }

    private async Task<Data.Donation> Deliver(string body)
    {
        Assert.IsType<Ok>((await Webhook(Request(body, Sign(body)))).Result);
        return await _db.Donations.OrderBy(d => d.Id).LastAsync();
    }

    [Fact]
    public async Task A_refund_of_a_coffee_is_kept_too_not_taken_for_the_coffee_again()
    {
        await Deliver(Donation);
        var refund = await Deliver(Event("donation.refunded", """ "id":58,"amount":5,"currency":"GBP","supporter_name":"Jo Example","message":"Jo bought you a coffee" """));

        Assert.Equal(2, await _db.Donations.CountAsync());
        Assert.Equal(("donation.refunded:58", "donation.refunded"), (refund.TransactionId, refund.Type));
        Assert.Null(refund.Message);
        var alert = _alerts.Sent[^1];
        Assert.Equal("Refunded: 5 GBP to Jo Example", alert.Title);
        Assert.Equal("A coffee was refunded on Buy Me a Coffee.", alert.Message);
    }

    [Fact]
    public async Task A_membership_starting_changing_and_ending_is_each_kept_and_said()
    {
        const string member = """ "id":"m-7","amount":4,"currency":"GBP","supporter_name":"Ada" """;
        await Deliver(Event("membership.started", member));
        await Deliver(Event("membership.updated", member.Replace("\"amount\":4", "\"amount\":6")));
        await Deliver(Event("membership.cancelled", member));
        // A retry of one of them changes nothing.
        await Deliver(Event("membership.cancelled", member));

        Assert.Equal(["membership.started", "membership.updated", "membership.cancelled"], _db.Donations.OrderBy(d => d.Id).Select(d => d.Type));
        Assert.Equal(
            [("⭐ New member: Ada", "4 GBP a month."), ("Membership changed: Ada", "Now 6 GBP."), ("Membership cancelled: Ada", "They won't be charged again.")],
            _alerts.Sent.Select(a => (a.Title, a.Message)));
    }

    [Fact]
    public async Task An_extra_and_an_event_the_site_doesnt_know_still_arrive_and_say_what_they_are()
    {
        await Deliver(Event("extra_purchase.created", """ "id":9,"amount":"12.00","currency":"USD","supporter_name":"Bo","support_note":"Love the stickers" """));
        await Deliver(Event("wishlist.payment.created", """ "id":10,"amount":20,"currency":"USD","supporter_name":"Cy" """));

        Assert.Equal(("🛍️ 12.00 USD from Bo", "Love the stickers"), (_alerts.Sent[0].Title, _alerts.Sent[0].Message));
        Assert.Equal(("Buy Me a Coffee: Cy", "New event: wishlist.payment.created, 20 USD."), (_alerts.Sent[1].Title, _alerts.Sent[1].Message));
    }

    [Fact]
    public async Task Send_test_is_kept_as_a_test_and_the_phone_hears_quietly_that_no_money_moved()
    {
        var test = await Deliver(Event("donation.created", """ "id":1,"amount":5,"currency":"USD","supporter_name":"John" """, live: false));

        Assert.True(test.IsTest);
        var alert = Assert.Single(_alerts.Sent);
        Assert.Equal("Test: ☕ 5 USD from John", alert.Title);
        Assert.Equal("No message. (Sent with Send test: no money moved.)", alert.Message);
        Assert.Equal(Portfolio.Api.Features.Alerts.AlertPriority.Low, alert.Priority);
    }

    [Fact]
    public async Task Without_live_mode_older_webhooks_count_as_real()
    {
        var donation = await Deliver(Event("donation.created", """ "id":2,"amount":5,"currency":"GBP","supporter_name":"Jo" """, live: null));

        Assert.False(donation.IsTest);
        Assert.Equal(Portfolio.Api.Features.Alerts.AlertPriority.High, Assert.Single(_alerts.Sent).Priority);
    }

    [Fact]
    public void The_message_is_the_supporters_note_never_the_services_own_line()
    {
        var newer = SupportEndpoints.ParseBuyMeACoffee("""{"type":"donation.created","data":{"id":1,"message":"Jo bought you a coffee","supporter_name":"Jo"}}""");
        var noted = SupportEndpoints.ParseBuyMeACoffee("""{"type":"donation.created","data":{"id":1,"message":"Jo bought you a coffee","support_note":"Keep going!"}}""");
        var older = SupportEndpoints.ParseBuyMeACoffee("""{"response":{"message":"Thanks!"}}""", "coffee-purchase");

        Assert.Null(newer!.Message);
        Assert.Equal("Keep going!", noted!.Message);
        Assert.Equal("Thanks!", older!.Message);
    }

    [Fact]
    public async Task Without_an_amount_a_name_or_a_note_it_still_reads_well()
    {
        await Deliver(Event("donation.created", """ "id":3 """));

        var donation = await _db.Donations.SingleAsync();
        Assert.Equal(("Someone", "", ""), (donation.FromName, donation.Amount, donation.Currency));
        Assert.Equal(("☕ Someone bought you a coffee", "No message."), (_alerts.Sent[0].Title, _alerts.Sent[0].Message));
    }

    [Fact]
    public async Task Without_an_id_the_same_body_is_kept_once_and_another_body_again()
    {
        const string first = """{"type":"donation.created","data":{"amount":3,"supporter_name":"A"}}""";
        const string second = """{"type":"donation.created","data":{"amount":4,"supporter_name":"A"}}""";

        await Deliver(first);
        await Deliver(first);
        await Deliver(second);

        Assert.Equal(2, await _db.Donations.CountAsync());
        Assert.All(_db.Donations, d => Assert.Matches("^[0-9a-f]{64}$", d.TransactionId));
    }

    [Fact]
    public async Task What_is_too_long_is_cut_to_fit()
    {
        var name = new string('n', 300);
        var note = new string('m', 3000);
        var padding = new string('p', 25_000);
        var body = Event("donation.created", $$""" "id":4,"supporter_name":"{{name}}","support_note":"{{note}}","pad":"{{padding}}" """);

        var donation = await Deliver(body);

        Assert.Equal((200, 2000, 20_000), (donation.FromName.Length, donation.Message!.Length, donation.Payload!.Length));
    }

    [Fact]
    public async Task A_body_bigger_than_allowed_is_refused_whatever_its_length_header_says()
    {
        var big = Event("donation.created", $$""" "id":5,"pad":"{{new string('p', SupportEndpoints.MaxPayloadBytes)}}" """);
        var lying = Request(big, Sign(big));
        lying.ContentLength = 100;

        Assert.IsType<BadRequest>((await Webhook(Request(big, Sign(big)))).Result);
        Assert.IsType<BadRequest>((await Webhook(lying)).Result);
        Assert.Empty(_db.Donations);
    }

    [Theory]
    [InlineData("[]")]
    [InlineData("\"text\"")]
    [InlineData("42")]
    [InlineData("")]
    public async Task Json_that_isnt_an_object_is_a_bad_request(string body)
    {
        Assert.IsType<BadRequest>((await Webhook(Request(body, Sign(body)))).Result);
        Assert.Empty(_alerts.Sent);
    }

    [Theory]
    [InlineData("sha256={0}")]
    [InlineData("  {0}  ")]
    [InlineData("SHA256={0}")]
    public void A_signature_may_carry_its_algorithm_and_spaces(string format)
    {
        var body = Encoding.UTF8.GetBytes(Donation);

        Assert.True(SupportEndpoints.SignatureMatches(body, string.Format(format, Sign(Donation)), Secret));
        Assert.False(SupportEndpoints.SignatureMatches(body, string.Format(format, Sign(Donation + " ")), Secret));
    }

    [Fact]
    public async Task The_secret_saved_with_spaces_around_it_still_works()
    {
        Assert.IsType<Ok>((await Webhook(Request(Donation, Sign(Donation)), configured: $"  {Secret}\n")).Result);
    }

    [Fact]
    public async Task Every_alert_opens_the_Community_tab()
    {
        await Deliver(Donation);
        await Deliver(Event("donation.refunded", """ "id":58 """));
        await Deliver(Event("membership.started", """ "id":"m","supporter_name":"A" """, live: false));

        Assert.All(_alerts.Sent, a => Assert.Equal("/community", a.Path));
    }

    // ---------- The admin's list ----------

    [Fact]
    public async Task The_list_is_newest_first_a_page_at_a_time_and_says_which_were_tests()
    {
        for (var i = 1; i <= 5; i++)
        {
            await Deliver(Event("donation.created", $$""" "id":{{i}},"supporter_name":"S{{i}}" """, live: i != 3));
            _time.Advance(TimeSpan.FromMinutes(1));
        }

        var first = (await SupportEndpoints.ListDonations(_db, default, page: 1, pageSize: 2)).Value!;
        var all = (await SupportEndpoints.ListDonations(_db, default, page: 1, pageSize: 50)).Value!;
        var clamped = (await SupportEndpoints.ListDonations(_db, default, page: -1, pageSize: 999)).Value!;

        Assert.Equal(["S5", "S4"], first.Items.Select(d => d.FromName));
        Assert.Equal(5, first.TotalCount);
        Assert.Equal(["S3"], all.Items.Where(d => d.IsTest).Select(d => d.FromName));
        Assert.Equal((1, SupportEndpoints.MaxPageSize), (clamped.Page, clamped.PageSize));
    }

    private static Data.Donation Of(string type, string amount = "", string? message = null) =>
        new() { TransactionId = "t", Type = type, FromName = "Jo", Amount = amount, Currency = "", Message = message, Payload = "{}" };

    [Theory]
    [InlineData("membership.updated", "", "Membership changed: Jo", "A membership changed.")]
    [InlineData("membership.updated", "10", "Membership changed: Jo", "Now 10.")]
    [InlineData("extra_purchase.created", "", "🛍️ Jo", "Someone bought an extra.")]
    [InlineData("donation.refunded", "", "Refunded: Jo", "A coffee was refunded on Buy Me a Coffee.")]
    [InlineData("membership.started", "", "⭐ New member: Jo", "A membership started.")]
    [InlineData("coffee-purchase", "", "☕ Jo bought you a coffee", "No message.")]
    [InlineData("payout.sent", "", "Buy Me a Coffee: Jo", "New event: payout.sent.")]
    [InlineData("payout.sent", "50", "Buy Me a Coffee: Jo", "New event: payout.sent, 50.")]
    public void Every_kind_of_event_reads_well_with_or_without_an_amount(string type, string amount, string title, string message)
    {
        var alert = SupportEndpoints.AlertFor(Of(type, amount));

        Assert.Equal((title, message), (alert.Title, alert.Message));
    }

    [Fact]
    public void Numbers_count_as_text_and_anything_else_is_ignored()
    {
        var parsed = SupportEndpoints.ParseBuyMeACoffee("""{"type":"donation.created","data":{"id":12,"amount":4.5,"supporter_name":{"first":"Jo"},"currency":true}}""")!;

        Assert.Equal(("12", "4.5"), (parsed.Id, parsed.Amount));
        Assert.Null(parsed.FromName);
        Assert.Null(parsed.Currency);
    }

    [Fact]
    public void A_flat_body_is_read_from_its_top()
    {
        var parsed = SupportEndpoints.ParseBuyMeACoffee("""{"type":"donation.created","id":"9","supporter_name":"Jo"}""")!;

        Assert.Equal(("9", "Jo"), (parsed.Id, parsed.FromName));
    }
}
