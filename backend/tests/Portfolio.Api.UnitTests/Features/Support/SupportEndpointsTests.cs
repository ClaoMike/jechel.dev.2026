using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Support;
using Portfolio.Api.UnitTests.Features.Alerts;

namespace Portfolio.Api.UnitTests.Features.Support;

public class SupportEndpointsTests
{
    private const string Token = "kofi-secret";
    private static readonly DateTimeOffset Now = new(2026, 10, 18, 12, 0, 0, TimeSpan.Zero);

    private readonly FakeTimeProvider _time = new(Now);
    private readonly FakePhoneAlerts _alerts = new();
    private readonly PortfolioDbContext _db = new(new DbContextOptionsBuilder<PortfolioDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    private static string Payment(string token = Token, string id = "tx-1", string message = "Thanks for the game!") =>
        $$"""{"verification_token":"{{token}}","message_id":"m1","timestamp":"2026-10-18T12:00:00Z","type":"Donation","is_public":true,"from_name":"Jo Example","message":"{{message}}","amount":"3.00","url":"https://ko-fi.com/Home/CoffeeShop?txid=1","email":"jo@example.com","currency":"GBP","is_subscription_payment":false,"is_first_subscription_payment":false,"kofi_transaction_id":"{{id}}","shop_items":null,"tier_name":null,"shipping":null}""";

    private static HttpRequest Form(string data)
    {
        var context = new DefaultHttpContext();
        var body = Encoding.UTF8.GetBytes("data=" + Uri.EscapeDataString(data));
        context.Request.Method = "POST";
        context.Request.ContentType = "application/x-www-form-urlencoded";
        context.Request.Body = new MemoryStream(body);
        context.Request.ContentLength = body.Length;
        return context.Request;
    }

    private Task<Results<Ok, BadRequest, UnauthorizedHttpResult, ProblemHttpResult>> Webhook(string data, string configured = Token) =>
        SupportEndpoints.KoFiWebhook(Form(data), _db, Options.Create(new SupportOptions { KoFiVerificationToken = configured }), _alerts, _time, CancellationToken.None);

    [Fact]
    public async Task A_donation_is_stored_once_and_rings_the_phone_once()
    {
        Assert.IsType<Ok>((await Webhook(Payment())).Result);
        Assert.IsType<Ok>((await Webhook(Payment())).Result);

        var donation = await _db.Donations.SingleAsync();
        Assert.Equal(("tx-1", "Donation", "Jo Example", "3.00", "GBP", "jo@example.com"), (donation.TransactionId, donation.Type, donation.FromName, donation.Amount, donation.Currency, donation.Email));
        Assert.Equal(Now, donation.ReceivedAt);
        var alert = Assert.Single(_alerts.Sent);
        Assert.Equal("☕ 3.00 GBP from Jo Example", alert.Title);
        Assert.Equal("Thanks for the game!", alert.Message);
    }

    [Fact]
    public async Task A_wrong_token_is_refused()
    {
        Assert.IsType<UnauthorizedHttpResult>((await Webhook(Payment(token: "guess"))).Result);
        Assert.Empty(_db.Donations);
        Assert.Empty(_alerts.Sent);
    }

    [Fact]
    public async Task Without_a_configured_token_the_webhook_is_off()
    {
        var result = await Webhook(Payment(), configured: "");

        Assert.Equal(503, Assert.IsType<ProblemHttpResult>(result.Result).StatusCode);
    }

    [Fact]
    public async Task Garbage_is_a_bad_request()
    {
        Assert.IsType<BadRequest>((await Webhook("not json")).Result);
    }

    [Theory]
    [InlineData("https://ko-fi.com/jechel", "https://ko-fi.com/jechel")]
    [InlineData("  https://buymeacoffee.com/jechel ", "https://buymeacoffee.com/jechel")]
    [InlineData("", "")]
    [InlineData("javascript:alert(1)", "")]
    [InlineData("/somewhere", "")]
    public void GetInfo_only_gives_out_web_links(string configured, string expected)
    {
        var info = SupportEndpoints.GetInfo(Options.Create(new SupportOptions { Url = configured }));

        Assert.Equal(expected, info.Value!.Url);
    }
}
