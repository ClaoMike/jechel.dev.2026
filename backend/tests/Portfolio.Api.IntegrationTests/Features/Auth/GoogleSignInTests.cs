using System.Net;
using System.Net.Http.Json;
using System.Web;
using Portfolio.Api.Features.Auth;

namespace Portfolio.Api.IntegrationTests.Features.Auth;

/// <summary>The whole Google flow through the real pipeline; Google's servers are FakeGoogle.</summary>
[Collection(ApiCollection.Name)]
public class GoogleSignInTests(PortfolioApiFactory factory) : IAsyncLifetime
{
    public Task InitializeAsync()
    {
        factory.Google.User = FakeGoogle.Account();
        return Task.CompletedTask;
    }

    public Task DisposeAsync()
    {
        factory.Google.User = FakeGoogle.Account();
        return Task.CompletedTask;
    }

    private int AlertsTitled(string title) => factory.Alerts.All.Count(a => a.Title == title);

    [Fact]
    public async Task Sends_the_browser_to_Google_with_the_callback_state_and_PKCE()
    {
        var browser = factory.CreateBrowserClient();

        var login = await browser.GetAsync("/api/auth/login?returnUrl=%2F");

        Assert.Equal(HttpStatusCode.Redirect, login.StatusCode);
        var toGoogle = login.Headers.Location!;
        Assert.Equal("accounts.google.com", toGoogle.Host);
        var query = HttpUtility.ParseQueryString(toGoogle.Query);
        Assert.Equal("http://localhost/api/auth/signin-google", query["redirect_uri"]);
        Assert.Equal("code", query["response_type"]);
        Assert.Equal("S256", query["code_challenge_method"]);
        Assert.False(string.IsNullOrEmpty(query["state"]));
        Assert.Contains("email", query["scope"]!);
        // The correlation cookie, which ties Google's answer to this browser.
        Assert.Contains(login.Headers.GetValues("Set-Cookie"), c => c.StartsWith(".AspNetCore.Correlation.", StringComparison.Ordinal) && c.Contains("httponly"));
    }

    [Fact]
    public async Task Signs_the_admin_in_and_back_to_where_they_were()
    {
        var signedIn = AlertsTitled("Signed in to jechel.dev");

        var (browser, callback) = await factory.SignInWithGoogleAsync("/youtube");

        Assert.Equal(HttpStatusCode.Redirect, callback.StatusCode);
        Assert.Equal("/youtube", callback.Headers.Location!.OriginalString);
        Assert.Contains(callback.Headers.GetValues("Set-Cookie"), c => c.StartsWith("portfolio.auth=", StringComparison.Ordinal) && c.Contains("httponly") && c.Contains("samesite=lax"));
        var me = await browser.GetFromJsonAsync<CurrentUserResponse>("/api/auth/me");
        Assert.Equal((PortfolioApiFactory.AdminEmail, "The Admin", "https://lh3.googleusercontent.com/a/admin"), (me!.Email, me.Name, me.PictureUrl));
        Assert.Equal(signedIn + 1, AlertsTitled("Signed in to jechel.dev"));
    }

    [Fact]
    public async Task Signing_in_again_in_the_same_browser_replaces_its_session()
    {
        var (browser, _) = await factory.SignInWithGoogleAsync();
        var first = (await browser.GetFromJsonAsync<List<AdminSessionInfo>>("/api/auth/sessions"))!.Single(s => s.Current).Id;

        var login = await browser.GetAsync("/api/auth/login?returnUrl=%2F");
        var state = HttpUtility.ParseQueryString(login.Headers.Location!.Query)["state"]!;
        var again = await browser.GetAsync($"/api/auth/signin-google?code=the-code&state={Uri.EscapeDataString(state)}");

        Assert.Equal("/", again.Headers.Location!.OriginalString);
        var devices = (await browser.GetFromJsonAsync<List<AdminSessionInfo>>("/api/auth/sessions"))!;
        Assert.DoesNotContain(devices, d => d.Id == first);
        Assert.Single(devices, d => d.Current);
    }

    [Fact]
    public async Task Swaps_the_code_for_a_token_with_the_PKCE_verifier()
    {
        var before = factory.Google.TokenRequests.Count;

        await factory.SignInWithGoogleAsync();

        var request = HttpUtility.ParseQueryString(factory.Google.TokenRequests.ToArray()[before]);
        Assert.Equal("the-code", request["code"]);
        Assert.Equal("authorization_code", request["grant_type"]);
        Assert.Equal(43, request["code_verifier"]!.Length);
    }

    [Theory]
    [InlineData("someone@example.com", true)]
    [InlineData(PortfolioApiFactory.AdminEmail, false)]
    public async Task Refuses_another_account_or_an_unverified_email_and_rings_the_admin(string email, bool verified)
    {
        factory.Google.User = FakeGoogle.Account(email, verified);
        var refused = AlertsTitled("Sign-in refused");

        var (browser, callback) = await factory.SignInWithGoogleAsync();

        Assert.Equal("/admin?error=not_authorized", callback.Headers.Location!.OriginalString);
        Assert.DoesNotContain(callback.Headers.TryGetValues("Set-Cookie", out var cookies) ? cookies : [], c => c.StartsWith("portfolio.auth=", StringComparison.Ordinal) && !c.Contains("expires=Thu, 01 Jan 1970"));
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(refused + 1, AlertsTitled("Sign-in refused"));
        Assert.Contains(email, factory.Alerts.All.Last(a => a.Title == "Sign-in refused").Message);
    }

    [Fact]
    public async Task With_Google_ids_pinned_needs_the_same_account_not_just_the_email()
    {
        await using var pinned = factory.WithWebHostBuilder(builder => builder.UseSetting("Auth:AdminGoogleIds:0", FakeGoogle.Subject));

        var (_, theAccount) = await pinned.SignInWithGoogleAsync();
        factory.Google.User = FakeGoogle.Account(subject: "999999999999999999999");
        var (_, sameEmailOtherAccount) = await pinned.SignInWithGoogleAsync();

        Assert.Equal("/", theAccount.Headers.Location!.OriginalString);
        Assert.Equal("/admin?error=not_authorized", sameEmailOtherAccount.Headers.Location!.OriginalString);
    }

    [Fact]
    public async Task Going_back_from_Googles_consent_screen_says_the_sign_in_failed()
    {
        var browser = factory.CreateBrowserClient();
        var login = await browser.GetAsync("/api/auth/login?returnUrl=%2F");
        var state = HttpUtility.ParseQueryString(login.Headers.Location!.Query)["state"]!;

        var callback = await browser.GetAsync($"/api/auth/signin-google?error=access_denied&state={Uri.EscapeDataString(state)}");

        Assert.Equal("/admin?error=login_failed", callback.Headers.Location!.OriginalString);
    }

    [Fact]
    public async Task Refuses_an_answer_meant_for_another_browser()
    {
        var victim = factory.CreateBrowserClient();
        var login = await victim.GetAsync("/api/auth/login?returnUrl=%2F");
        var state = HttpUtility.ParseQueryString(login.Headers.Location!.Query)["state"]!;

        // An attacker's browser (no correlation cookie) replaying the victim's state.
        var attacker = factory.CreateBrowserClient();
        var callback = await attacker.GetAsync($"/api/auth/signin-google?code=the-code&state={Uri.EscapeDataString(state)}");

        Assert.Equal("/admin?error=login_failed", callback.Headers.Location!.OriginalString);
        Assert.Equal(HttpStatusCode.Unauthorized, (await attacker.GetAsync("/api/auth/me")).StatusCode);
    }

    [Theory]
    [InlineData("https://evil.example/phish")]
    [InlineData("//evil.example")]
    public async Task Never_sends_the_admin_off_the_site_after_signing_in(string returnUrl)
    {
        var (_, callback) = await factory.SignInWithGoogleAsync(returnUrl);

        Assert.Equal("/", callback.Headers.Location!.OriginalString);
    }

    [Fact]
    public async Task Answers_503_when_Google_isnt_set_up()
    {
        await using var noGoogle = factory.WithWebHostBuilder(builder => builder.UseSetting("Authentication:Google:ClientId", ""));

        var response = await noGoogle.CreateClient().GetAsync("/api/auth/login");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }
}
