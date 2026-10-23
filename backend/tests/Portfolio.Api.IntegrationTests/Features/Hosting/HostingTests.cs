using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Auth;
using Portfolio.Api.Features.Updates;
using Portfolio.Api.Features.YouTube;

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
        request.Headers.Add(ProxyHeaders.ClientCountryHeader, "GB");
        return request;
    }

    // The end-to-end tests (e2e/) point Google, YouTube, Resend, Cal.com and LeetCode at their stand-ins (E2E:Services),
    // but only in their own environment: set anywhere else, the setting changes nothing.
    private WebApplicationFactory<Program> WithStandIns(string environment) =>
        factory.WithWebHostBuilder(builder => builder.UseEnvironment(environment).UseSetting("E2E:Services", "http://localhost:5299/"));

    [Theory]
    [InlineData("Development")]
    [InlineData("Production")]
    public async Task The_end_to_end_stand_ins_are_ignored_outside_their_environment(string environment)
    {
        await using var api = WithStandIns(environment);

        var login = await api.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false }).GetAsync("/api/auth/login?returnUrl=%2F");

        Assert.Equal("accounts.google.com", login.Headers.Location!.Host);
        var http = api.Services.GetRequiredService<IHttpClientFactory>();
        Assert.Equal(ResendEmailSender.BaseAddress, http.CreateClient(nameof(ResendEmailSender)).BaseAddress);
        Assert.Equal(YouTubeClient.BaseAddress, http.CreateClient(nameof(IYouTubeClient)).BaseAddress);
    }

    [Fact]
    public async Task In_the_end_to_end_environment_the_outside_services_are_the_stand_ins()
    {
        await using var api = WithStandIns(AuthSetup.EndToEndEnvironment);

        var login = await api.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false }).GetAsync("/api/auth/login?returnUrl=%2F");

        Assert.StartsWith("http://localhost:5299/google/auth?", login.Headers.Location!.OriginalString);
        var http = api.Services.GetRequiredService<IHttpClientFactory>();
        Assert.Equal(new Uri("http://localhost:5299/resend/"), http.CreateClient(nameof(ResendEmailSender)).BaseAddress);
        Assert.Equal(new Uri("http://localhost:5299/youtube/"), http.CreateClient(nameof(IYouTubeClient)).BaseAddress);
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
    public async Task Health_says_which_build_is_running_so_a_deploy_can_wait_for_it()
    {
        await using var api = factory.WithWebHostBuilder(builder => builder.UseSetting("APP_VERSION", "abc1234"));

        var response = await api.CreateClient().GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("abc1234", response.Headers.GetValues("X-App-Version").Single());
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Health_says_dev_when_no_build_is_named()
    {
        var response = await factory.CreateClient().GetAsync("/api/health");

        Assert.Equal("dev", response.Headers.GetValues("X-App-Version").Single());
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
    public async Task A_sign_in_through_the_proxy_remembers_the_visitors_address_and_country_and_rings_with_them()
    {
        await using var api = BehindProxy();
        var browser = api.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var login = await browser.SendAsync(ThroughProxy("/api/auth/login?returnUrl=%2F"));
        var state = System.Web.HttpUtility.ParseQueryString(login.Headers.Location!.Query)["state"]!;
        var correlation = login.Headers.GetValues("Set-Cookie").First(c => c.StartsWith(".AspNetCore.Correlation.", StringComparison.Ordinal)).Split(';')[0];
        var callback = ThroughProxy($"/api/auth/signin-google?code=the-code&state={Uri.EscapeDataString(state)}");
        callback.Headers.Add("Cookie", correlation);

        var signedIn = await browser.SendAsync(callback);

        Assert.Equal("/", signedIn.Headers.Location!.OriginalString);
        Assert.Contains("203.0.113.7 (GB)", factory.Alerts.All.Last(a => a.Title == "Signed in to jechel.dev").Message);
        using var scope = factory.Services.CreateScope();
        Assert.Contains(scope.ServiceProvider.GetRequiredService<PortfolioDbContext>().AdminSessions, s => s.IpAddress == "203.0.113.7" && s.Country == "GB");
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
