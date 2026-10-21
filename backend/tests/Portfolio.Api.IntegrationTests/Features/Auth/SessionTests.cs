using System.Net;
using System.Net.Http.Json;
using Portfolio.Api.Features.Auth;

namespace Portfolio.Api.IntegrationTests.Features.Auth;

/// <summary>Sessions through the real pipeline: one per device, kept alive by activity, ended in several ways.</summary>
[Collection(ApiCollection.Name)]
public class SessionTests(PortfolioApiFactory factory)
{
    private const string IPhone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

    private static async Task<HttpStatusCode> MeAsync(HttpClient browser) => (await browser.GetAsync("/api/auth/me")).StatusCode;

    private static async Task<List<AdminSessionInfo>> DevicesAsync(HttpClient browser) =>
        (await browser.GetFromJsonAsync<List<AdminSessionInfo>>("/api/auth/sessions"))!;

    [Fact]
    public async Task Visitors_are_nobody_and_cant_see_the_devices()
    {
        var visitor = factory.CreateBrowserClient();

        Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(visitor));
        Assert.Equal(HttpStatusCode.Unauthorized, (await visitor.GetAsync("/api/auth/sessions")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await visitor.PostAsync("/api/auth/sessions/end-others", null)).StatusCode);
    }

    [Fact]
    public async Task Says_who_is_signed_in_and_for_how_long_without_activity()
    {
        var me = await (await factory.SignedInAsync()).GetFromJsonAsync<CurrentUserResponse>("/api/auth/me");

        Assert.Equal(PortfolioApiFactory.AdminEmail, me!.Email);
        Assert.Equal(600, me.SessionExpiresInSeconds);
    }

    [Fact]
    public async Task Someone_not_on_the_list_gets_no_session_even_with_a_cookie()
    {
        var other = await factory.SignedInAsync("someone@example.com");

        Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(other));
    }

    [Fact]
    public async Task Each_device_has_its_own_session_and_signing_out_ends_only_that_one()
    {
        var laptop = await factory.SignedInAsync();
        var phone = await factory.SignedInAsync(userAgent: IPhone);

        var signOut = await laptop.PostAsync("/api/auth/logout", null);

        Assert.Equal(HttpStatusCode.OK, signOut.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(laptop));
        Assert.Equal(HttpStatusCode.OK, await MeAsync(phone));
    }

    [Fact]
    public async Task Lists_the_devices_marking_this_one()
    {
        var laptop = await factory.SignedInAsync();
        var phone = await factory.SignedInAsync(userAgent: IPhone);

        var seenFromPhone = await DevicesAsync(phone);

        var thisPhone = Assert.Single(seenFromPhone, d => d.Current);
        Assert.Equal(("Safari on iOS", "mobile"), (thisPhone.Device, thisPhone.DeviceType));
        Assert.Contains(seenFromPhone, d => d.Device == "Chrome on macOS" && !d.Current);
        Assert.DoesNotContain(seenFromPhone, d => d.Current && d.Device == "Chrome on macOS");
        await phone.PostAsync("/api/auth/sessions/end-others", null);
        Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(laptop));
    }

    [Fact]
    public async Task Signs_one_device_out_from_another()
    {
        var laptop = await factory.SignedInAsync();
        var phone = await factory.SignedInAsync(userAgent: IPhone);
        var laptopId = (await DevicesAsync(laptop)).Single(d => d.Current).Id;

        var ended = await phone.DeleteAsync($"/api/auth/sessions/{laptopId}");

        Assert.Equal(HttpStatusCode.NoContent, ended.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(laptop));
        Assert.Equal(HttpStatusCode.OK, await MeAsync(phone));
        Assert.Equal(HttpStatusCode.NotFound, (await phone.DeleteAsync($"/api/auth/sessions/{laptopId}")).StatusCode);
    }

    [Fact]
    public async Task Signs_out_every_other_device_and_says_how_many()
    {
        var laptop = await factory.SignedInAsync();
        await factory.SignedInAsync(userAgent: IPhone);
        await factory.SignedInAsync(userAgent: IPhone);

        var ended = await (await laptop.PostAsync("/api/auth/sessions/end-others", null)).Content.ReadFromJsonAsync<EndedSessions>();

        Assert.True(ended!.Count >= 2);
        Assert.Single(await DevicesAsync(laptop));
        Assert.Equal(HttpStatusCode.OK, await MeAsync(laptop));
    }

    [Fact]
    public async Task A_visitor_signing_out_ends_nobodys_session()
    {
        var admin = await factory.SignedInAsync();

        Assert.Equal(HttpStatusCode.OK, (await factory.CreateBrowserClient().PostAsync("/api/auth/logout", null)).StatusCode);

        Assert.Equal(HttpStatusCode.OK, await MeAsync(admin));
    }

    [Fact]
    public async Task Ends_after_10_minutes_without_activity()
    {
        var admin = await factory.SignedInAsync();

        factory.Time.Advance(TimeSpan.FromMinutes(10));

        Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(admin));
    }

    [Fact]
    public async Task Activity_keeps_it_going_and_renews_the_cookie()
    {
        var admin = await factory.SignedInAsync();

        factory.Time.Advance(TimeSpan.FromMinutes(9));
        var active = await admin.GetAsync("/api/auth/me");
        factory.Time.Advance(TimeSpan.FromMinutes(9));

        Assert.Contains(active.Headers.GetValues("Set-Cookie"), c => c.StartsWith("portfolio.auth=", StringComparison.Ordinal));
        Assert.Equal(HttpStatusCode.OK, await MeAsync(admin));
    }

    [Fact]
    public async Task Ends_12_hours_after_signing_in_however_active()
    {
        var admin = await factory.SignedInAsync();

        for (var minutes = 5; minutes < 12 * 60; minutes += 5)
        {
            factory.Time.Advance(TimeSpan.FromMinutes(5));
            Assert.Equal(HttpStatusCode.OK, await MeAsync(admin));
        }
        var lastMinutes = await admin.GetFromJsonAsync<CurrentUserResponse>("/api/auth/me");
        factory.Time.Advance(TimeSpan.FromMinutes(5));

        Assert.Equal(300, lastMinutes!.SessionExpiresInSeconds);
        Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(admin));
    }

    [Fact]
    public async Task Taking_an_email_off_the_list_ends_its_sessions()
    {
        var noCookies = new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = false };
        var signIn = await factory.CreateClient(noCookies).GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}");
        var cookie = signIn.Headers.GetValues("Set-Cookie").First(c => c.StartsWith("portfolio.auth=", StringComparison.Ordinal)).Split(';')[0];
        await using var removed = factory.WithWebHostBuilder(builder => builder.UseSetting("Auth:AdminEmails:0", "someone-else@example.com"));

        Task<HttpResponseMessage> MeWith(Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> api)
        {
            var request = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
            request.Headers.Add("Cookie", cookie);
            return api.CreateClient(noCookies).SendAsync(request);
        }

        Assert.Equal(HttpStatusCode.Unauthorized, (await MeWith(removed)).StatusCode);
        // Ended, not just refused there: it's gone where the email is still listed too.
        Assert.Equal(HttpStatusCode.Unauthorized, (await MeWith(factory)).StatusCode);
    }
}
