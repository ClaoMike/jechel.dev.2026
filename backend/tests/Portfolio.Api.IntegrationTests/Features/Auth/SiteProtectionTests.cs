using System.Net;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Portfolio.Api.Features.Auth;

namespace Portfolio.Api.IntegrationTests.Features.Auth;

/// <summary>Cross-site requests with the admin's cookie, the API's own headers, and the cookie in production.</summary>
[Collection(ApiCollection.Name)]
public class SiteProtectionTests(PortfolioApiFactory factory)
{
    private static HttpRequestMessage SignOut(string? origin)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/logout");
        if (origin is not null) request.Headers.Add("Origin", origin);
        return request;
    }

    [Fact]
    public async Task Refuses_a_write_with_the_admins_cookie_from_another_site_and_keeps_the_session()
    {
        var admin = await factory.SignedInAsync();

        var response = await admin.SendAsync(SignOut("https://evil.example"));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Contains("Cross-site request refused.", await response.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/auth/me")).StatusCode);
    }

    [Theory]
    [InlineData("http://localhost")]
    [InlineData(null)]
    public async Task Lets_through_writes_from_the_site_itself_or_from_no_browser(string? origin)
    {
        var admin = await factory.SignedInAsync();

        Assert.Equal(HttpStatusCode.OK, (await admin.SendAsync(SignOut(origin))).StatusCode);
    }

    [Fact]
    public async Task Doesnt_check_writes_without_the_cookie_like_webhooks_or_visitors()
    {
        var response = await factory.CreateClient().SendAsync(SignOut("https://evil.example"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Lets_reads_through_from_anywhere()
    {
        var admin = await factory.SignedInAsync();
        var read = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        read.Headers.Add("Origin", "https://evil.example");

        Assert.Equal(HttpStatusCode.OK, (await admin.SendAsync(read)).StatusCode);
    }

    [Fact]
    public async Task Tells_browsers_not_to_guess_types_frame_the_API_or_leak_its_addresses()
    {
        var response = await factory.CreateClient().GetAsync("/api/health");

        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
        Assert.Equal("strict-origin-when-cross-origin", response.Headers.GetValues("Referrer-Policy").Single());
    }

    [Fact]
    public async Task In_production_the_cookie_is_a_secure_host_only_one()
    {
        await using var production = factory.WithWebHostBuilder(builder => builder.UseEnvironment("Production"));

        var cookie = production.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>().Get(CookieAuthenticationDefaults.AuthenticationScheme).Cookie;

        Assert.Equal(("__Host-portfolio.auth", "/", CookieSecurePolicy.Always, SameSiteMode.Lax, true), (cookie.Name, cookie.Path, cookie.SecurePolicy, cookie.SameSite, cookie.HttpOnly));
        Assert.Null(cookie.Domain);
        await Task.CompletedTask;
    }
}
