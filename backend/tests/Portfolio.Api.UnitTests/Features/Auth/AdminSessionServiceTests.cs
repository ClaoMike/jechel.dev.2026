using System.Net;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Analytics;
using Portfolio.Api.Features.Auth;

namespace Portfolio.Api.UnitTests.Features.Auth;

public class AdminSessionServiceTests
{
    private const string Chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
    private const string IPhone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

    private readonly string _database = Guid.NewGuid().ToString();
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 21, 9, 0, 0, TimeSpan.Zero));
    private readonly AdminOptions _options = new() { AdminEmails = ["admin@example.com"] };

    private PortfolioDbContext Db() => new(new DbContextOptionsBuilder<PortfolioDbContext>().UseInMemoryDatabase(_database).Options);

    /// <summary>The service as one request has it.</summary>
    private AdminSessionService Service() => new(Db(), _time, TestOptions.Monitor(_options));

    private static ClaimsPrincipal Admin(string email = "admin@example.com") =>
        new(new ClaimsIdentity([new Claim(ClaimTypes.Email, email)], "Google"));

    private static DefaultHttpContext Request(string userAgent = Chrome, string ip = "203.0.113.7", string? country = "GB")
    {
        var http = new DefaultHttpContext();
        http.Request.Headers.UserAgent = userAgent;
        http.Connection.RemoteIpAddress = IPAddress.Parse(ip);
        if (country is not null) http.Request.Headers["CF-IPCountry"] = country;
        return http;
    }

    /// <summary>Signs a device in: the principal its cookie would carry (with the token).</summary>
    private async Task<(ClaimsPrincipal Cookie, AdminSession Session)> SignInAsync(string userAgent = Chrome)
    {
        var principal = Admin();
        var session = await Service().StartAsync(principal, Request(userAgent));
        return (principal, session);
    }

    private Task<SessionStatus> ValidateAsync(ClaimsPrincipal cookie) => Service().ValidateAsync(cookie);

    [Fact]
    public async Task Signing_in_keeps_only_the_tokens_hash_and_puts_the_token_in_the_cookie()
    {
        var (cookie, session) = await SignInAsync();

        var token = cookie.FindFirstValue(AdminSessionService.TokenClaimType)!;
        Assert.Equal(43, token.Length);
        var stored = await Db().AdminSessions.SingleAsync();
        Assert.Equal(AdminSessionService.Hash(token), stored.TokenHash);
        Assert.DoesNotContain(token, stored.TokenHash);
        Assert.Equal(session.Id, stored.Id);
    }

    [Fact]
    public async Task Remembers_the_device_its_address_and_country_and_its_times()
    {
        var (_, session) = await SignInAsync();

        Assert.Equal(("admin@example.com", Chrome, "203.0.113.7", "GB"), (session.Email, session.UserAgent, session.IpAddress, session.Country));
        var now = _time.GetUtcNow();
        Assert.Equal((now, now, now.AddMinutes(10), now.AddHours(12)), (session.CreatedAt, session.LastSeenAt, session.ExpiresAt, session.EndsAt));
    }

    [Fact]
    public async Task Keeps_a_very_long_user_agent_to_512_characters_and_drops_unknown_countries()
    {
        var session = await Service().StartAsync(Admin(), Request(new string('x', 2000), country: "XX"));

        Assert.Equal(AdminSessionService.UserAgentMaxLength, session.UserAgent.Length);
        Assert.Null(session.Country);
    }

    [Fact]
    public async Task Each_sign_in_is_its_own_device_and_the_others_stay_signed_in()
    {
        var (laptop, _) = await SignInAsync();
        var (phone, _) = await SignInAsync(IPhone);

        Assert.Equal(SessionStatus.Valid, await ValidateAsync(laptop));
        Assert.Equal(SessionStatus.Valid, await ValidateAsync(phone));
        Assert.Equal(2, await Db().AdminSessions.CountAsync());
    }

    [Fact]
    public async Task Activity_pushes_the_end_forward_at_most_once_a_minute()
    {
        var (cookie, session) = await SignInAsync();

        _time.Advance(TimeSpan.FromSeconds(59));
        Assert.Equal(SessionStatus.Valid, await ValidateAsync(cookie));
        _time.Advance(TimeSpan.FromSeconds(1));
        Assert.Equal(SessionStatus.Extended, await ValidateAsync(cookie));

        var stored = await Db().AdminSessions.SingleAsync();
        Assert.Equal(_time.GetUtcNow().AddMinutes(10), stored.ExpiresAt);
        Assert.Equal(_time.GetUtcNow(), stored.LastSeenAt);
        Assert.Equal(session.EndsAt, stored.EndsAt);
    }

    [Fact]
    public async Task Ends_after_10_minutes_without_activity_and_is_cleared_away()
    {
        var (cookie, _) = await SignInAsync();

        _time.Advance(TimeSpan.FromMinutes(10));

        Assert.Equal(SessionStatus.Invalid, await ValidateAsync(cookie));
        Assert.Empty(await Db().AdminSessions.ToListAsync());
    }

    [Fact]
    public async Task Ends_12_hours_after_signing_in_however_active()
    {
        var (cookie, session) = await SignInAsync();

        for (var i = 0; i < 12 * 12 - 1; i++)
        {
            _time.Advance(TimeSpan.FromMinutes(5));
            Assert.NotEqual(SessionStatus.Invalid, await ValidateAsync(cookie));
        }
        // Five minutes before the end, activity only takes it to the end.
        Assert.Equal(session.EndsAt, (await Db().AdminSessions.SingleAsync()).ExpiresAt);

        _time.Advance(TimeSpan.FromMinutes(5));

        Assert.Equal(SessionStatus.Invalid, await ValidateAsync(cookie));
    }

    [Fact]
    public async Task Tells_the_request_when_its_session_ends()
    {
        var (cookie, _) = await SignInAsync();
        var service = Service();

        await service.ValidateAsync(cookie);

        Assert.Equal(_time.GetUtcNow().AddMinutes(10), service.CurrentExpiresAt);
    }

    [Fact]
    public async Task Refuses_a_cookie_without_a_token_with_an_unknown_one_or_for_another_email()
    {
        var (cookie, _) = await SignInAsync();
        var token = cookie.FindFirstValue(AdminSessionService.TokenClaimType)!;
        ClaimsPrincipal With(string email, string? withToken) =>
            new(new ClaimsIdentity([new Claim(ClaimTypes.Email, email), .. withToken is null ? Array.Empty<Claim>() : [new Claim(AdminSessionService.TokenClaimType, withToken)]], "Cookies"));

        Assert.Equal(SessionStatus.Invalid, await ValidateAsync(With("admin@example.com", null)));
        Assert.Equal(SessionStatus.Invalid, await ValidateAsync(With("admin@example.com", "made-up")));
        Assert.Equal(SessionStatus.Invalid, await ValidateAsync(With("someone@example.com", token)));
    }

    [Fact]
    public async Task Lists_the_devices_still_signed_in_most_recently_active_first_marking_this_one()
    {
        var (laptop, laptopSession) = await SignInAsync();
        _time.Advance(TimeSpan.FromMinutes(2));
        var (phone, phoneSession) = await SignInAsync(IPhone);
        var (gone, _) = await SignInAsync();
        _time.Advance(TimeSpan.FromMinutes(5));
        await ValidateAsync(laptop);
        await ValidateAsync(phone);
        _time.Advance(TimeSpan.FromMinutes(6));
        await ValidateAsync(laptop);
        _time.Advance(TimeSpan.FromMinutes(1));
        await ValidateAsync(phone);
        var service = Service();
        await service.ValidateAsync(phone);

        var list = await service.ListAsync();

        // The third one went quiet for 11 minutes: it's over, so not listed.
        Assert.Equal([phoneSession.Id, laptopSession.Id], list.Select(s => s.Id));
        Assert.Equal(("Safari on iOS", "mobile", true), (list[0].Device, list[0].DeviceType, list[0].Current));
        Assert.Equal(("Chrome on macOS", "desktop", false), (list[1].Device, list[1].DeviceType, list[1].Current));
        Assert.Equal(("203.0.113.7", "GB"), (list[1].IpAddress, list[1].Country));
        Assert.Equal(laptopSession.EndsAt, list[1].EndsAt);
    }

    [Fact]
    public async Task Signing_out_ends_this_device_only()
    {
        var (laptop, _) = await SignInAsync();
        var (phone, _) = await SignInAsync(IPhone);
        var service = Service();
        await service.ValidateAsync(laptop);

        await service.EndCurrentAsync();

        Assert.Null(service.Current);
        Assert.Equal(SessionStatus.Invalid, await ValidateAsync(laptop));
        Assert.Equal(SessionStatus.Valid, await ValidateAsync(phone));
    }

    [Fact]
    public async Task Ends_one_device_by_its_id_or_says_there_was_none()
    {
        var (_, laptopSession) = await SignInAsync();
        var (phone, _) = await SignInAsync(IPhone);

        Assert.True(await Service().EndAsync(laptopSession.Id));
        Assert.False(await Service().EndAsync(laptopSession.Id));
        Assert.Equal(SessionStatus.Valid, await ValidateAsync(phone));
    }

    [Fact]
    public async Task Ends_the_session_a_cookie_carries_and_ignores_one_without_a_token()
    {
        var (laptop, _) = await SignInAsync();
        var (phone, _) = await SignInAsync(IPhone);

        await Service().EndAsync(laptop);
        await Service().EndAsync(laptop);
        await Service().EndAsync(Admin());

        Assert.Equal(SessionStatus.Invalid, await ValidateAsync(laptop));
        Assert.Equal(SessionStatus.Valid, await ValidateAsync(phone));
    }

    [Fact]
    public async Task Ends_every_other_device()
    {
        var (laptop, _) = await SignInAsync();
        var (phone, _) = await SignInAsync(IPhone);
        var (tablet, _) = await SignInAsync(IPhone);
        var service = Service();
        await service.ValidateAsync(laptop);

        Assert.Equal(2, await service.EndOthersAsync());

        Assert.Equal(SessionStatus.Valid, await ValidateAsync(laptop));
        Assert.Equal(SessionStatus.Invalid, await ValidateAsync(phone));
        Assert.Equal(SessionStatus.Invalid, await ValidateAsync(tablet));
    }

    [Fact]
    public async Task Signing_in_clears_away_sessions_that_have_ended()
    {
        await SignInAsync();
        _time.Advance(TimeSpan.FromMinutes(11));

        await SignInAsync();

        Assert.Single(await Db().AdminSessions.ToListAsync());
    }

    [Fact]
    public async Task Needs_a_principal_with_an_identity() =>
        await Assert.ThrowsAsync<ArgumentException>(() => Service().StartAsync(new ClaimsPrincipal(), Request()));

    [Theory]
    [InlineData("Chrome", "macOS", "Chrome on macOS")]
    [InlineData("Other", "Linux", "A browser on Linux")]
    [InlineData("Firefox", "Other", "Firefox")]
    [InlineData("Other", "Other", "A browser")]
    public void Names_a_device_by_its_browser_and_system(string browser, string os, string expected) =>
        Assert.Equal(expected, AdminSessionService.Describe(new AnalyticsRules.UserAgentInfo("desktop", browser, os, false)));
}
