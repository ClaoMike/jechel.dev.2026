using System.Net;
using System.Net.Http.Json;
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

    private static FormUrlEncodedContent KoFi(string token, string transactionId) => new(
    [
        new("data", $$"""{"verification_token":"{{token}}","type":"Donation","is_public":true,"from_name":"Jo","message":"Great site","amount":"5.00","currency":"GBP","email":"jo@example.com","kofi_transaction_id":"{{transactionId}}"}"""),
    ]);

    [Fact]
    public async Task Anyone_gets_where_the_button_goes()
    {
        var info = await factory.CreateBrowserClient().GetFromJsonAsync<SupportInfo>("/api/support");

        Assert.Equal("https://ko-fi.com/test", info!.Url);
    }

    [Fact]
    public async Task Ko_fi_payments_are_stored_once_and_listed_for_the_admin()
    {
        var transaction = Guid.NewGuid().ToString();
        var koFi = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await koFi.PostAsync("/api/support/kofi", KoFi(PortfolioApiFactory.KoFiToken, transaction))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await koFi.PostAsync("/api/support/kofi", KoFi(PortfolioApiFactory.KoFiToken, transaction))).StatusCode);

        var admin = await SignedInClientAsync();
        var donations = await admin.GetFromJsonAsync<PagedResponse<DonationDto>>("/api/support/donations?pageSize=50");
        var donation = Assert.Single(donations!.Items, d => d.Message == "Great site" && d.Amount == "5.00");
        Assert.Equal("Jo", donation.FromName);
    }

    [Fact]
    public async Task A_wrong_token_is_refused()
    {
        var response = await factory.CreateClient().PostAsync("/api/support/kofi", KoFi("guess", Guid.NewGuid().ToString()));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Visitors_cant_list_donations()
    {
        var response = await factory.CreateBrowserClient().GetAsync("/api/support/donations");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
