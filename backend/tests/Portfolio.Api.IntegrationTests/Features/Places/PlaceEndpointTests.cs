using System.Net;
using System.Net.Http.Json;
using Portfolio.Api.Features.Places;

namespace Portfolio.Api.IntegrationTests.Features.Places;

[Collection(ApiCollection.Name)]
public class PlaceEndpointTests(PortfolioApiFactory factory)
{
    [Fact]
    public async Task Only_the_admin_can_search()
    {
        var response = await factory.CreateBrowserClient().GetAsync("/api/places/search?q=london");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task The_admin_finds_cities_largest_first()
    {
        var admin = factory.CreateBrowserClient();
        (await admin.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}")).EnsureSuccessStatusCode();

        var cities = await admin.GetFromJsonAsync<City[]>("/api/places/search?q=manchester&limit=3");

        Assert.Equal(3, cities!.Length);
        Assert.Equal(("Manchester", "United Kingdom"), (cities[0].Name, cities[0].Country));
        Assert.True(cities[0].Population >= cities[1].Population);
    }
}
