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
        Assert.Equal(("58", "donation.created", "Jo Example", "5", "GBP", "jo@example.com"), (donation.TransactionId, donation.Type, donation.FromName, donation.Amount, donation.Currency, donation.Email));
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
    public void GetInfo_only_gives_out_web_links(string configured, string expected)
    {
        var info = SupportEndpoints.GetInfo(TestOptions.Monitor(new SupportOptions { Url = configured }));

        Assert.Equal(expected, info.Value!.Url);
    }
}
