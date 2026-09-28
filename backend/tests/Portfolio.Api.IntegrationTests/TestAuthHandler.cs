using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Portfolio.Api.IntegrationTests;

/// <summary>
/// Stands in for the Google-issued cookie: requests carrying the <see cref="EmailHeader"/>
/// header are authenticated as that email. Requests without it stay anonymous.
/// </summary>
public class TestAuthHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "Test";
    public const string EmailHeader = "X-Test-Email";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(EmailHeader, out var email))
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        var identity = new ClaimsIdentity(
        [
            new Claim(ClaimTypes.Email, email.ToString()),
            new Claim(ClaimTypes.Name, "Test Admin"),
        ], SchemeName);

        return Task.FromResult(AuthenticateResult.Success(
            new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
    }
}
