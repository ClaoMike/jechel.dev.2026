using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Portfolio.Api.Data;

namespace Portfolio.Api.IntegrationTests.Features.Hosting;

/// <summary>Production hosting: the API behind the site's /api proxy, and Data Protection keys kept in the database.</summary>
[Collection(ApiCollection.Name)]
public class HostingTests(PortfolioApiFactory factory)
{
    private const string Secret = "test-proxy-secret";

    private WebApplicationFactory<Program> BehindProxy() =>
        factory.WithWebHostBuilder(builder => builder.UseSetting("Proxy:Secret", Secret));

    private static HttpRequestMessage ThroughProxy(string path, string? secret = Secret)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        if (secret is not null) request.Headers.Add(ProxyHeaders.SecretHeader, secret);
        request.Headers.Add(ProxyHeaders.HostHeader, "jechel.dev");
        request.Headers.Add(ProxyHeaders.ClientIpHeader, "203.0.113.7");
        return request;
    }

    [Fact]
    public async Task Requests_without_the_proxy_secret_get_404()
    {
        await using var api = BehindProxy();
        var client = api.CreateClient();

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/firstname")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.SendAsync(ThroughProxy("/api/firstname", secret: "wrong"))).StatusCode);
    }

    [Fact]
    public async Task Health_answers_without_the_secret_for_the_hosting_platform()
    {
        await using var api = BehindProxy();

        Assert.Equal(HttpStatusCode.OK, (await api.CreateClient().GetAsync("/api/health")).StatusCode);
    }

    [Fact]
    public async Task Requests_through_the_proxy_are_served()
    {
        await using var api = BehindProxy();

        Assert.Equal(HttpStatusCode.OK, (await api.CreateClient().SendAsync(ThroughProxy("/api/firstname"))).StatusCode);
    }

    [Fact]
    public async Task Google_sign_in_comes_back_to_the_sites_https_address()
    {
        await using var api = BehindProxy();
        var client = api.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var response = await client.SendAsync(ThroughProxy("/api/auth/login?returnUrl=%2Fadmin"));

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        var location = Uri.UnescapeDataString(response.Headers.Location!.ToString());
        Assert.Contains("redirect_uri=https://jechel.dev/api/auth/signin-google", location);
    }

    [Fact]
    public async Task Data_protection_keys_are_kept_in_the_database()
    {
        // Signing in issues an encrypted cookie, which needs a key.
        var client = factory.CreateBrowserClient();
        (await client.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}")).EnsureSuccessStatusCode();

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PortfolioDbContext>();
        Assert.NotEmpty(await db.DataProtectionKeys.ToListAsync());
    }
}
