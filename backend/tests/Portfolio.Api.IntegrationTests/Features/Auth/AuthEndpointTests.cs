using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Portfolio.Api.Features.Auth;

namespace Portfolio.Api.IntegrationTests.Features.Auth;

[Collection(ApiCollection.Name)]
public class AuthEndpointTests(PortfolioApiFactory factory)
{
    private HttpClient CreateClient() =>
        factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    [Fact]
    public async Task Me_returns_401_when_anonymous()
    {
        var response = await CreateClient().GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Me_returns_the_signed_in_user()
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, PortfolioApiFactory.AdminEmail);

        var response = await client.GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var user = await response.Content.ReadFromJsonAsync<CurrentUserResponse>();
        Assert.Equal(PortfolioApiFactory.AdminEmail, user!.Email);
    }

    [Fact]
    public async Task Login_redirects_to_google_with_the_api_callback()
    {
        var response = await CreateClient().GetAsync("/api/auth/login?returnUrl=/");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        var location = response.Headers.Location!.ToString();
        Assert.StartsWith("https://accounts.google.com/", location);
        Assert.Contains("client_id=test-client-id", location);
        Assert.Contains(Uri.EscapeDataString("http://localhost/api/auth/signin-google"), location);
        Assert.Contains(response.Headers.GetValues("Set-Cookie"), c => c.StartsWith(".AspNetCore.Correlation."));
    }

    [Fact]
    public async Task Logout_clears_the_auth_cookie()
    {
        var response = await CreateClient().PostAsync("/api/auth/logout", null);

        Assert.True(response.IsSuccessStatusCode);
        Assert.Contains(response.Headers.GetValues("Set-Cookie"), c => c.StartsWith("portfolio.auth=;"));
    }
}
