using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Portfolio.Api.Features.Auth;

public record CurrentUserResponse(string Email, string? Name, string? PictureUrl);

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var auth = app.MapGroup("/auth");

        auth.MapGet("/login", Login).WithName("Login");
        auth.MapGet("/me", GetCurrentUser).WithName("GetCurrentUser").RequireAuthorization();
        auth.MapPost("/logout", Logout).WithName("Logout");

        return app;
    }

    /// <summary>Starts the Google sign-in flow; the browser navigates here (not fetch).</summary>
    public static async Task<Results<ChallengeHttpResult, ProblemHttpResult>> Login(
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

    public static Ok<CurrentUserResponse> GetCurrentUser(ClaimsPrincipal user) =>
        TypedResults.Ok(new CurrentUserResponse(
            user.FindFirstValue(ClaimTypes.Email)!,
            user.FindFirstValue(ClaimTypes.Name),
            user.FindFirstValue("picture")));

    public static SignOutHttpResult Logout() =>
        TypedResults.SignOut(authenticationSchemes: [CookieAuthenticationDefaults.AuthenticationScheme]);

    /// <summary>Only allow same-site relative paths, to prevent open redirects.</summary>
    public static string ToSafeReturnUrl(string? returnUrl) =>
        !string.IsNullOrEmpty(returnUrl) &&
        returnUrl.StartsWith('/') &&
        !returnUrl.StartsWith("//") &&
        !returnUrl.StartsWith("/\\")
            ? returnUrl
            : "/";
}
