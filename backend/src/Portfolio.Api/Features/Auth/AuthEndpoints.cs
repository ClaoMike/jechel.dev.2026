using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Portfolio.Api.Features.Auth;

/// <param name="SessionExpiresInSeconds">
/// Relative (not a timestamp) so the browser's clock doesn't matter.
/// </param>
public record CurrentUserResponse(string Email, string? Name, string? PictureUrl, int SessionExpiresInSeconds);

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

    /// <summary>Like any authenticated request, this also counts as activity and extends the session.</summary>
    public static Ok<CurrentUserResponse> GetCurrentUser(ClaimsPrincipal user, AdminSessionService sessions, TimeProvider time)
    {
        var expiresIn = sessions.CurrentExpiresAt is { } expiresAt ? expiresAt - time.GetUtcNow() : TimeSpan.Zero;

        return TypedResults.Ok(new CurrentUserResponse(
            user.FindFirstValue(ClaimTypes.Email)!,
            user.FindFirstValue(ClaimTypes.Name),
            user.FindFirstValue("picture"),
            (int)Math.Max(0, expiresIn.TotalSeconds)));
    }

    /// <summary>
    /// Clears this browser's cookie. If the caller has a valid session, it's also ended in the
    /// database, which signs the admin out everywhere. Anonymous callers can't end the admin's session.
    /// </summary>
    public static async Task<SignOutHttpResult> Logout(
        ClaimsPrincipal user,
        AdminSessionService sessions,
        CancellationToken cancellationToken)
    {
        if (user.Identity?.IsAuthenticated == true)
        {
            await sessions.EndAsync(cancellationToken);
        }

        return TypedResults.SignOut(authenticationSchemes: [CookieAuthenticationDefaults.AuthenticationScheme]);
    }

    /// <summary>Only allow same-site relative paths, to prevent open redirects.</summary>
    public static string ToSafeReturnUrl(string? returnUrl) =>
        !string.IsNullOrEmpty(returnUrl) &&
        returnUrl.StartsWith('/') &&
        !returnUrl.StartsWith("//") &&
        !returnUrl.StartsWith("/\\")
            ? returnUrl
            : "/";
}
