using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
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
        $$$"""{"type":"donation.created","data":{"id":"{{{id}}}","amount":"5.00","currency":"GBP","support_note":"Great site","supporter_name":"Jo"}}""";

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
        Assert.Single(donations!.Items, d => d.Message == "Great site" && d.FromName == "Jo");
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
