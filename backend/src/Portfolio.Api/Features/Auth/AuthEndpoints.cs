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

/// <param name="Count">How many devices were signed out.</param>
public record EndedSessions(int Count);

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var auth = app.MapGroup("/auth");

        auth.MapGet("/login", Login).WithName("Login");
        auth.MapGet("/me", GetCurrentUser).WithName("GetCurrentUser").RequireAuthorization();
        auth.MapPost("/logout", Logout).WithName("Logout");

        var sessions = auth.MapGroup("/sessions").RequireAuthorization();
        sessions.MapGet("/", ListSessions).WithName("ListSessions");
        sessions.MapDelete("/{id:guid}", EndSession).WithName("EndSession");
        sessions.MapPost("/end-others", EndOtherSessions).WithName("EndOtherSessions");

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
            user.FindFirstValue(GoogleSignIn.PictureClaimType),
            // Whole seconds, rounded up: the database keeps microseconds, so a fresh 10-minute session reads 599.9999999s.
            (int)Math.Ceiling(Math.Max(0, expiresIn.TotalSeconds))));
    }

    /// <summary>
    /// Signs out this device: clears its cookie and ends its session in the database. Other devices stay
    /// signed in (Settings → Signed-in devices ends them). Anonymous callers only clear their own cookie.
    /// </summary>
    public static async Task<SignOutHttpResult> Logout(
        ClaimsPrincipal user,
        AdminSessionService sessions,
        CancellationToken cancellationToken)
    {
        if (user.Identity?.IsAuthenticated == true)
        {
            await sessions.EndCurrentAsync(cancellationToken);
        }

        return TypedResults.SignOut(authenticationSchemes: [CookieAuthenticationDefaults.AuthenticationScheme]);
    }

    /// <summary>Admin only. Every device signed in, the most recently active first, this one marked.</summary>
    public static async Task<Ok<IReadOnlyList<AdminSessionInfo>>> ListSessions(AdminSessionService sessions, CancellationToken cancellationToken) =>
        TypedResults.Ok(await sessions.ListAsync(cancellationToken));

    /// <summary>Admin only. Signs one device out (this one too, if it's asked: its next request is anonymous).</summary>
    public static async Task<Results<NoContent, NotFound>> EndSession(Guid id, AdminSessionService sessions, CancellationToken cancellationToken) =>
        await sessions.EndAsync(id, cancellationToken) ? TypedResults.NoContent() : TypedResults.NotFound();

    /// <summary>Admin only. Signs out every device but this one.</summary>
    public static async Task<Ok<EndedSessions>> EndOtherSessions(AdminSessionService sessions, CancellationToken cancellationToken) =>
        TypedResults.Ok(new EndedSessions(await sessions.EndOthersAsync(cancellationToken)));

    /// <summary>
    /// Only allow same-site relative paths, to prevent open redirects. Browsers drop tabs and line breaks from a
    /// URL and read "\\" as "/", so "/\t/evil.example" would become "//evil.example": no control characters, spaces
    /// or backslashes anywhere.
    /// </summary>
    public static string ToSafeReturnUrl(string? returnUrl) =>
        !string.IsNullOrEmpty(returnUrl) &&
        returnUrl.StartsWith('/') &&
        !returnUrl.StartsWith("//") &&
        !returnUrl.Any(c => char.IsControl(c) || char.IsWhiteSpace(c) || c == '\\')
            ? returnUrl
            : "/";
}
