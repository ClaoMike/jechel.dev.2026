using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;

namespace Portfolio.Api.Features.Auth;

/// <summary>
/// Signs out this device: clears its cookie and ends its session in the database. Other devices stay
/// signed in (Settings → Signed-in devices ends them). Anonymous callers only clear their own cookie.
/// </summary>
public sealed class Logout : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/auth").MapPost("/logout", Handle).WithName("Logout");

    public static async Task<SignOutHttpResult> Handle(
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
}
