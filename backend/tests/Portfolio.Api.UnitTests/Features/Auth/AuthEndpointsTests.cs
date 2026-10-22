using System.Net;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Auth;

namespace Portfolio.Api.UnitTests.Features.Auth;

public class AuthEndpointsTests
{
    [Theory]
    [InlineData(null, "/")]
    [InlineData("", "/")]
    [InlineData("/", "/")]
    [InlineData("/admin", "/admin")]
    [InlineData("/youtube?page=2", "/youtube?page=2")]
    [InlineData("https://evil.example.com", "/")]
    [InlineData("//evil.example.com", "/")]
    [InlineData("/\\evil.example.com", "/")]
    [InlineData("admin", "/")]
    [InlineData("javascript:alert(1)", "/")]
    // Browsers drop tabs and line breaks from URLs, and read a backslash as a slash: each would become "//evil.example.com".
    [InlineData("/\t/evil.example.com", "/")]
    [InlineData("/\n/evil.example.com", "/")]
    [InlineData("/\r\n/evil.example.com", "/")]
    [InlineData("/x\\..\\/evil.example.com", "/")]
    [InlineData("/ /evil.example.com", "/")]
    [InlineData("/about?tab=1#top", "/about?tab=1#top")]
    public void Only_lets_sign_in_return_to_a_path_on_this_site(string? input, string expected) =>
        Assert.Equal(expected, AuthEndpoints.ToSafeReturnUrl(input));

    [Fact]
    public async Task Says_who_is_signed_in_and_the_seconds_left_rounded_up()
    {
        var time = new FakeTimeProvider(new DateTimeOffset(2026, 10, 21, 9, 0, 0, TimeSpan.Zero));
        var db = new PortfolioDbContext(new DbContextOptionsBuilder<PortfolioDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var sessions = new AdminSessionService(db, time, TestOptions.Monitor(new AdminOptions { AdminEmails = ["admin@example.com"] }));
        var user = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim(ClaimTypes.Email, "admin@example.com"),
            new Claim(ClaimTypes.Name, "The Admin"),
            new Claim(GoogleSignIn.PictureClaimType, "https://example.com/me.png"),
        ], "Google"));
        var http = new DefaultHttpContext();
        http.Connection.RemoteIpAddress = IPAddress.Loopback;
        await sessions.StartAsync(user, http);
        // The database keeps microseconds: a fraction of one early.
        time.Advance(TimeSpan.FromTicks(1));

        var me = AuthEndpoints.GetCurrentUser(user, sessions, time).Value!;

        Assert.Equal(new CurrentUserResponse("admin@example.com", "The Admin", "https://example.com/me.png", 600), me);
    }

    [Fact]
    public void Says_zero_seconds_left_without_a_session()
    {
        var sessions = new AdminSessionService(null!, new FakeTimeProvider(), TestOptions.Monitor(new AdminOptions()));
        var user = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Email, "admin@example.com")], "Google"));

        Assert.Equal(0, AuthEndpoints.GetCurrentUser(user, sessions, new FakeTimeProvider()).Value!.SessionExpiresInSeconds);
    }

    [Fact]
    public void Describes_where_a_sign_in_came_from_for_the_alert()
    {
        var http = new DefaultHttpContext();
        http.Request.Headers.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";
        http.Connection.RemoteIpAddress = IPAddress.Parse("198.51.100.4");
        http.Request.Headers["CF-IPCountry"] = "ro";
        var unknown = new DefaultHttpContext();

        Assert.Equal("Edge on Windows · 198.51.100.4 (RO)", GoogleSignIn.DeviceOf(http));
        Assert.Equal("A browser · an unknown address", GoogleSignIn.DeviceOf(unknown));
    }
}
