using System.Net;
using System.Net.Http.Json;
using Portfolio.Api.Features.Profile;

namespace Portfolio.Api.IntegrationTests.Features.Profile;

[Collection(ApiCollection.Name)]
public class FirstNameEndpointTests(PortfolioApiFactory factory)
{
    [Fact]
    public async Task Get_firstname_returns_seeded_value_from_database()
    {
        var client = factory.CreateClient();

        var response = await client.GetAsync("/api/firstname");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<FirstNameResponse>();
        Assert.Equal("Claudiu", body!.FirstName);
    }
}
