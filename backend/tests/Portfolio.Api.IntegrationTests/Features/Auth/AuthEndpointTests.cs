using System.Net;
using System.Net.Http.Json;
using Portfolio.Api.Features.Auth;

namespace Portfolio.Api.IntegrationTests.Features.Auth;

[Collection(ApiCollection.Name)]
public class AuthEndpointTests(PortfolioApiFactory factory)
{
    private async Task<HttpClient> SignedInClientAsync(string email = PortfolioApiFactory.AdminEmail)
    {
        var client = factory.CreateBrowserClient();
        var response = await client.GetAsync($"{PortfolioApiFactory.SignInPath}?email={Uri.EscapeDataString(email)}");
        response.EnsureSuccessStatusCode();
        return client;
    }

    [Fact]
    public async Task Me_returns_401_when_anonymous()
    {
        var response = await factory.CreateBrowserClient().GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Me_returns_the_signed_in_user_and_session_expiry()
    {
        var client = await SignedInClientAsync();

        var response = await client.GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var user = await response.Content.ReadFromJsonAsync<CurrentUserResponse>();
        Assert.Equal(PortfolioApiFactory.AdminEmail, user!.Email);
        Assert.Equal(600, user.SessionExpiresInSeconds);
    }

    [Fact]
    public async Task Non_admin_accounts_are_rejected()
    {
        var client = await SignedInClientAsync("someone@example.com");

        var response = await client.GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Session_expires_after_10_idle_minutes()
    {
        var client = await SignedInClientAsync();

        factory.Time.Advance(TimeSpan.FromMinutes(10));

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Activity_keeps_the_session_alive()
    {
        var client = await SignedInClientAsync();

        for (var i = 0; i < 3; i++)
        {
            factory.Time.Advance(TimeSpan.FromMinutes(6));
            // Any request with the cookie counts as activity, not just /me.
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/firstname")).StatusCode);
        }

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Extending_the_session_reissues_the_cookie_with_a_new_expiry()
    {
        var client = factory.CreateClient(new() { AllowAutoRedirect = false, HandleCookies = false });
        var signIn = await client.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}");
        var authCookie = signIn.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("portfolio.auth=")).Split(';')[0];

        // Within the first minute: no extension, so no new cookie.
        factory.Time.Advance(TimeSpan.FromSeconds(30));
        var early = await SendWithCookieAsync(client, HttpMethod.Get, "/api/firstname", authCookie);
        Assert.False(early.Headers.Contains("Set-Cookie"));

        factory.Time.Advance(TimeSpan.FromMinutes(5));
        var later = await SendWithCookieAsync(client, HttpMethod.Get, "/api/firstname", authCookie);
        var renewed = later.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("portfolio.auth="));
        var expires = DateTimeOffset.Parse(renewed.Split(';').Single(p => p.Trim().StartsWith("expires=")).Split('=')[1]);
        Assert.Equal(factory.Time.GetUtcNow().AddMinutes(10), expires, TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task Signing_in_elsewhere_signs_out_the_previous_browser()
    {
        var laptop = await SignedInClientAsync();
        var phone = await SignedInClientAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, (await laptop.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await phone.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Logout_ends_the_session_in_the_database_not_just_the_cookie()
    {
        // Cookies handled by hand, so the old cookie can be replayed after logging out
        // (as another device, or a stolen cookie, would still have it).
        var client = factory.CreateClient(new() { AllowAutoRedirect = false, HandleCookies = false });
        var signIn = await client.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}");
        var authCookie = signIn.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("portfolio.auth=")).Split(';')[0];

        Assert.Equal(HttpStatusCode.OK, (await SendWithCookieAsync(client, HttpMethod.Get, "/api/auth/me", authCookie)).StatusCode);

        var logout = await SendWithCookieAsync(client, HttpMethod.Post, "/api/auth/logout", authCookie);

        Assert.True(logout.IsSuccessStatusCode);
        Assert.Contains(logout.Headers.GetValues("Set-Cookie"), c => c.StartsWith("portfolio.auth=;"));
        Assert.Equal(HttpStatusCode.Unauthorized, (await SendWithCookieAsync(client, HttpMethod.Get, "/api/auth/me", authCookie)).StatusCode);
    }

    [Fact]
    public async Task Anonymous_logout_does_not_end_the_admin_session()
    {
        var admin = await SignedInClientAsync();

        await factory.CreateBrowserClient().PostAsync("/api/auth/logout", null);

        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Login_redirects_to_google_with_the_api_callback()
    {
        var response = await factory.CreateBrowserClient().GetAsync("/api/auth/login?returnUrl=/");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        var location = response.Headers.Location!.ToString();
        Assert.StartsWith("https://accounts.google.com/", location);
        Assert.Contains("client_id=test-client-id", location);
        Assert.Contains(Uri.EscapeDataString("http://localhost/api/auth/signin-google"), location);
        Assert.Contains(response.Headers.GetValues("Set-Cookie"), c => c.StartsWith(".AspNetCore.Correlation."));
    }

    [Fact]
    public async Task Health_check_reports_healthy()
    {
        var response = await factory.CreateBrowserClient().GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
    }

    private static Task<HttpResponseMessage> SendWithCookieAsync(HttpClient client, HttpMethod method, string url, string cookie)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.Add("Cookie", cookie);
        return client.SendAsync(request);
    }
}
