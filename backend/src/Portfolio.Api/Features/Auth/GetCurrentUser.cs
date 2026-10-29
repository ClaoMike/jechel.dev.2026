using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;

namespace Portfolio.Api.Features.Auth;

/// <summary>Like any authenticated request, this also counts as activity and extends the session.</summary>
public sealed class GetCurrentUser : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/auth").MapGet("/me", Handle).WithName("GetCurrentUser").RequireAuthorization();

    public static Ok<CurrentUserResponse> Handle(ClaimsPrincipal user, AdminSessionService sessions, TimeProvider time)
    {
        var expiresIn = sessions.CurrentExpiresAt is { } expiresAt ? expiresAt - time.GetUtcNow() : TimeSpan.Zero;

        return TypedResults.Ok(new CurrentUserResponse(
            user.FindFirstValue(ClaimTypes.Email)!,
            user.FindFirstValue(ClaimTypes.Name),
            user.FindFirstValue(GoogleSignIn.PictureClaimType),
            // Whole seconds, rounded up: the database keeps microseconds, so a fresh 10-minute session reads 599.9999999s.
            (int)Math.Ceiling(Math.Max(0, expiresIn.TotalSeconds))));
    }
}
