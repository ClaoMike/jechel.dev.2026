using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using Portfolio.Api.Common;
using Portfolio.Api.Features.Support;

namespace Portfolio.Api.IntegrationTests.Features.Support;

[Collection(ApiCollection.Name)]
public class SupportEndpointTests(PortfolioApiFactory factory)
{
    private async Task<HttpClient> SignedInClientAsync()
    {
        var client = factory.CreateBrowserClient();
        var response = await client.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}");
        response.EnsureSuccessStatusCode();
        return client;
    }

    private static HttpRequestMessage Webhook(string body, string secret)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/support/buymeacoffee") { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        request.Headers.Add("X-Signature-Sha256", Convert.ToHexStringLower(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(body))));
        return request;
    }

    private static string Donation(string id) =>
        $$$"""{"type":"donation.created","data":{"id":"{{{id}}}","amount":"5.00","currency":"GBP","support_note":"Great site {{{id}}}","supporter_name":"Jo"}}""";

    [Fact]
    public async Task Anyone_gets_where_the_button_goes()
    {
        var info = await factory.CreateBrowserClient().GetFromJsonAsync<SupportInfo>("/api/support");

        Assert.Equal("https://buymeacoffee.com/test", info!.Url);
    }

    [Fact]
    public async Task Signed_payments_are_stored_once_and_listed_for_the_admin()
    {
        var id = Guid.NewGuid().ToString();
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(Webhook(Donation(id), PortfolioApiFactory.BuyMeACoffeeSecret))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(Webhook(Donation(id), PortfolioApiFactory.BuyMeACoffeeSecret))).StatusCode);

        var admin = await SignedInClientAsync();
        var donations = await admin.GetFromJsonAsync<PagedResponse<DonationDto>>("/api/support/donations?pageSize=50");
        Assert.Single(donations!.Items, d => d.Message == $"Great site {id}" && d.FromName == "Jo");
    }

    [Fact]
    public async Task A_coffee_then_its_refund_are_both_listed_and_a_test_says_so()
    {
        var id = Guid.NewGuid().ToString();
        var client = factory.CreateClient();
        var refund = Donation(id).Replace("donation.created", "donation.refunded");
        var test = $$$"""{"type":"donation.created","live_mode":false,"data":{"id":"{{{Guid.NewGuid()}}}","amount":5,"currency":"USD","supporter_name":"Test {{{id}}}"}}""";

        foreach (var body in new[] { Donation(id), refund, test })
            Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(Webhook(body, PortfolioApiFactory.BuyMeACoffeeSecret))).StatusCode);

        var donations = (await (await SignedInClientAsync()).GetFromJsonAsync<PagedResponse<DonationDto>>("/api/support/donations?pageSize=50"))!.Items;
        Assert.Single(donations, d => d.Type == "donation.created" && d.Message == $"Great site {id}" && !d.IsTest);
        Assert.Single(donations, d => d.Type == "donation.refunded" && d.Message == $"Great site {id}");
        Assert.True(Assert.Single(donations, d => d.FromName == $"Test {id}").IsTest);
        Assert.Contains(factory.Alerts.All, a => a.Title == "Refunded: 5.00 GBP to Jo");
    }

    [Fact]
    public async Task The_same_event_delivered_several_times_at_once_is_stored_once()
    {
        var name = $"Retry {Guid.NewGuid():N}";
        var body = $$$"""{"type":"donation.created","data":{"id":"{{{Guid.NewGuid()}}}","amount":3,"currency":"GBP","supporter_name":"{{{name}}}"}}""";
        var client = factory.CreateClient();

        var responses = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => client.SendAsync(Webhook(body, PortfolioApiFactory.BuyMeACoffeeSecret))));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        var donations = (await (await SignedInClientAsync()).GetFromJsonAsync<PagedResponse<DonationDto>>("/api/support/donations?pageSize=50"))!.Items;
        Assert.Single(donations, d => d.FromName == name);
        Assert.Single(factory.Alerts.All, a => a.Title == $"☕ 3 GBP from {name}");
    }

    [Fact]
    public async Task A_wrong_signature_is_refused()
    {
        var response = await factory.CreateClient().SendAsync(Webhook(Donation(Guid.NewGuid().ToString()), "guess"));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Visitors_cant_list_donations()
    {
        var response = await factory.CreateBrowserClient().GetAsync("/api/support/donations");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
