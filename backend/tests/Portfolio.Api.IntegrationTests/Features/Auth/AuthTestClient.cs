using System.Web;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Portfolio.Api.IntegrationTests.Features.Auth;

/// <summary>Signing in the way a browser does: through Google's flow (FakeGoogle), or the test hook.</summary>
public static class AuthTestClient
{
    /// <summary>
    /// Clicks "Sign in with Google", "is sent" to Google, and comes back to the callback with a code and
    /// the state Google was given (as Google would). Returns the browser and the callback's answer.
    /// </summary>
    public static async Task<(HttpClient Browser, HttpResponseMessage Callback)> SignInWithGoogleAsync(this WebApplicationFactory<Program> api, string returnUrl = "/")
    {
        var browser = api.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var login = await browser.GetAsync($"/api/auth/login?returnUrl={Uri.EscapeDataString(returnUrl)}");
        var toGoogle = login.Headers.Location!;
        var state = HttpUtility.ParseQueryString(toGoogle.Query)["state"]!;
        var callback = await browser.GetAsync($"/api/auth/signin-google?code=the-code&state={Uri.EscapeDataString(state)}");
        return (browser, callback);
    }

    /// <summary>A browser signed in as the admin through the test hook (what Google's callback does after the checks).</summary>
    public static async Task<HttpClient> SignedInAsync(this PortfolioApiFactory api, string email = PortfolioApiFactory.AdminEmail, string userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/141.0.0.0 Safari/537.36")
    {
        var browser = api.CreateBrowserClient();
        browser.DefaultRequestHeaders.UserAgent.ParseAdd(userAgent);
        (await browser.GetAsync($"{PortfolioApiFactory.SignInPath}?email={Uri.EscapeDataString(email)}")).EnsureSuccessStatusCode();
        return browser;
    }
}
