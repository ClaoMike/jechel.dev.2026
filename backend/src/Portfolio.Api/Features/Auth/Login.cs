using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using static Portfolio.Api.Features.Auth.AuthShared;

namespace Portfolio.Api.Features.Auth;

/// <summary>Starts the Google sign-in flow; the browser navigates here (not fetch).</summary>
public sealed class Login : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/auth").MapGet("/login", Handle).WithName("Login");

    public static async Task<Results<ChallengeHttpResult, ProblemHttpResult>> Handle(
        string? returnUrl,
        IAuthenticationSchemeProvider schemes)
    {
        if (await schemes.GetSchemeAsync(GoogleDefaults.AuthenticationScheme) is null)
        {
            return TypedResults.Problem(
                title: "Google sign-in is not configured.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var properties = new AuthenticationProperties { RedirectUri = ToSafeReturnUrl(returnUrl) };
        return TypedResults.Challenge(properties, [GoogleDefaults.AuthenticationScheme]);
    }
}
