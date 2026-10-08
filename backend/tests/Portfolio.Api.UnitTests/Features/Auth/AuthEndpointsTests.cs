using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;
using Portfolio.Api.Features.Auth;

namespace Portfolio.Api.UnitTests.Features.Auth;

public class AuthEndpointsTests
{
    private static AuthenticationSchemeProvider CreateSchemes(bool withGoogle)
    {
        var options = new AuthenticationOptions();
        if (withGoogle)
        {
            options.AddScheme(GoogleDefaults.AuthenticationScheme, s => s.HandlerType = typeof(GoogleHandler));
        }
        return new AuthenticationSchemeProvider(Options.Create(options));
    }

    [Fact]
    public async Task Login_returns_503_when_google_is_not_configured()
    {
        var result = await AuthEndpoints.Login("/", CreateSchemes(withGoogle: false));

        var problem = Assert.IsType<ProblemHttpResult>(result.Result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, problem.StatusCode);
    }

    [Fact]
    public async Task Login_challenges_google_with_the_return_url()
    {
        var result = await AuthEndpoints.Login("/projects", CreateSchemes(withGoogle: true));

        var challenge = Assert.IsType<ChallengeHttpResult>(result.Result);
        Assert.Equal([GoogleDefaults.AuthenticationScheme], challenge.AuthenticationSchemes);
        Assert.Equal("/projects", challenge.Properties!.RedirectUri);
    }

    [Theory]
    [InlineData(null, "/")]
    [InlineData("", "/")]
    [InlineData("/", "/")]
    [InlineData("/admin", "/admin")]
    [InlineData("https://evil.example.com", "/")]
    [InlineData("//evil.example.com", "/")]
    [InlineData("/\\evil.example.com", "/")]
    [InlineData("admin", "/")]
    public void ToSafeReturnUrl_only_allows_local_paths(string? input, string expected) =>
        Assert.Equal(expected, AuthEndpoints.ToSafeReturnUrl(input));

    [Fact]
    public async Task GetCurrentUser_maps_claims_and_session_expiry()
    {
        var time = new FakeTimeProvider(DateTimeOffset.UtcNow);
        var db = new PortfolioDbContext(new DbContextOptionsBuilder<PortfolioDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        db.Profiles.Add(new Data.Profile { Id = 1, FirstName = "Claudiu" });
        await db.SaveChangesAsync();
        var sessions = new AdminSessionService(db, time, Mock.Monitor(new AdminOptions()));

        var user = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim(ClaimTypes.Email, "admin@example.com"),
            new Claim(ClaimTypes.Name, "Claudiu Jechel"),
            new Claim("picture", "https://example.com/me.png"),
        ], "Test"));
        await sessions.StartAsync(user);
        time.Advance(TimeSpan.FromMinutes(2));

        var result = AuthEndpoints.GetCurrentUser(user, sessions, time);

        Assert.Equal(
            new CurrentUserResponse("admin@example.com", "Claudiu Jechel", "https://example.com/me.png", 8 * 60),
            result.Value);
    }
}
